/*!
 * Copyright (c) 2017-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const brLedgerNode = require('bedrock-ledger-node');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const peers = [];
let ledgerNode;
const blockMethods = ['getConsensusProofPeers'];
const eventMethods = [
  'aggregateHistory', 'hasOutstandingParentHashCommitments',
  'hasOutstandingRegularEvents',
  'getAvgConsensusTime', 'getHead', 'getMergeEventHashes',
  'getMergeEventPeers', 'getStartHash', 'setEffectiveConfiguration', '_stat'
];
const testEventHashes = [];
const testCreatorIds = [];

describe('Continuity Storage', () => {
  // get consensus plugin and create genesis ledger node
  let genesisLedgerNode;
  let consensusApi;

  before(async () => {
    await helpers.prepareDatabase(mockData);
    const {ledgerConfiguration} = mockData;
    ({api: consensusApi} = await helpers.use('Continuity2017'));
    ledgerNode = genesisLedgerNode = await brLedgerNode.add(
      null, {ledgerConfiguration});
    peers.push(genesisLedgerNode);
  });

  before(async () => {
    for(const ledgerNode of peers) {
      const ledgerNodeId = ledgerNode.id;
      const peerId = await consensusApi._localPeers.getPeerId({ledgerNodeId});
      ledgerNode._peerId = peerId;
    }
  });

  before(async function() {
    this.timeout(60000);
    const opTemplate = mockData.operations.alpha;
    await helpers.addOperation({ledgerNode: genesisLedgerNode, opTemplate});
    await helpers.settleNetwork(
      {consensusApi, nodes: peers, series: false});
    const blockHashes = [];
    for(const ledgerNode of peers) {
      const result = await ledgerNode.storage.blocks.getLatest();
      const eventBlock = result.eventBlock;
      should.exist(eventBlock.block);
      eventBlock.block.blockHeight.should.equal(1);
      eventBlock.block.event.should.be.an('array');
      // a regular event and a merge event
      eventBlock.block.event.should.have.length(2);
      // push a valid eventHash to testEventHashes, this is a merge event
      testEventHashes.push(eventBlock.block.event[0].treeHash);
      // this is a different merge event
      testCreatorIds.push(eventBlock.block.event[1].proof
        .verificationMethod);
      blockHashes.push(eventBlock.meta.blockHash);
    }
    // the blockHash on every node should be the same
    blockHashes.every(h => h === blockHashes[0]).should.be.true;
  });
  // add a config event
  // FIXME: adding a config event is not currently supported
  /*before(async function() {
    this.timeout(210000);
    const ledgerConfiguration = bedrock.util.clone(
      mockData.ledgerConfiguration);
    ledgerConfiguration.operationValidator = [{
      type: 'SignatureValidator2017',
      validatorFilter: [{
        type: 'ValidatorFilterByType',
        validatorFilterByType: ['CreateWebLedgerRecord']
      }],
      approvedSigner: ['urn:uuid:99bfc16e-fc92-4e65-8ecf-343f413766cc'],
      minimumSignaturesRequired: 1
    }];
    ledgerConfiguration.creator = genesisLedgerNode._peerId;
    ledgerConfiguration.sequence = 1;
    await genesisLedgerNode.config.change({ledgerConfiguration});
    await helpers.settleNetwork(
      {consensusApi, nodes: peers, series: false});
    for(const ledgerNode of peers) {
      const c = await ledgerNode.config.get();
      c.should.eql(ledgerConfiguration);
    }
  });*/
  describe('Event APIs', () => {
    describe('check plugin methods', () => {
      it('all the plugin methods are properly bound', () => {
        should.exist(ledgerNode.storage.events.plugins['continuity-storage']);
        const pluginMethods = Object.keys(
          ledgerNode.storage.events.plugins['continuity-storage']);
        pluginMethods.should.have.same.members(eventMethods);
      });
    }); // end check plugin

    describe('getAvgConsensusTime', () => {
      it('produces a result', async () => {
        const {getAvgConsensusTime} = _getEventMethods();
        // the only creatorId in the network
        const [creatorId] = testCreatorIds;
        const r = await getAvgConsensusTime({creatorId});
        r.should.be.an('object');
        should.exist(r.avgConsensusTime);
        r.avgConsensusTime.should.be.a('number');
      });
      it('is indexed properly', async () => {
        const {getAvgConsensusTime} = _getEventMethods();
        // the only creatorId in the network
        const [creatorId] = testCreatorIds;
        const r = await getAvgConsensusTime({creatorId, explain: true});
        const {indexName} = r.stages[0].$cursor.queryPlanner.winningPlan
          .inputStage;
        indexName.should.equal('event.continuity2017.type.1');
      });
    });

    describe('getHead', () => {
      it('returns the proper head', async () => {
        const {getHead} = _getEventMethods();
        // FIXME: change to `peerId`
        const [creatorId] = testCreatorIds;
        const result = await getHead({creatorId});
        result.should.be.an('array');
        result.should.have.length(1);
        const record = result[0];
        should.exist(record.meta);
        should.exist(record.meta.eventHash);
        const {eventHash} = record.meta;
        eventHash.should.be.a('string');
        should.exist(record.meta.continuity2017);
        const {creator, generation} = record.meta.continuity2017;
        creator.should.equal(creatorId);
        generation.should.equal(1);
      });
      it('is properly indexed for creatorId parameter', async () => {
        const {getHead} = _getEventMethods();
        const [creatorId] = testCreatorIds;
        const r = await getHead({creatorId, explain: true});
        const {indexName} = r.queryPlanner.winningPlan.inputStage.inputStage;
        indexName.should.equal('event.continuity2017.type.1');
        const {executionStats: s} = r;
        s.nReturned.should.equal(1);
        s.totalKeysExamined.should.equal(1);
        s.totalDocsExamined.should.equal(0);
      });
      it('is properly indexed for generation === 0', async () => {
        const {getHead} = _getEventMethods();
        const r = await getHead({generation: 0, explain: true});
        const {indexName} = r.queryPlanner.winningPlan.inputStage.inputStage
          .inputStage;
        indexName.should.equal('event.continuity2017.type.1');
        const {executionStats: s} = r;
        s.nReturned.should.equal(1);
        s.totalKeysExamined.should.equal(2);
        // this happens exactly once to cache the genesis merge event
        // note: When an index covers a query, the explain result has an IXSCAN
        // stage that is not a descendant of a FETCH stage, and in the
        // executionStats, the totalDocsExamined is 0.
        // eslint-disable-next-line max-len
        // @see https://docs.mongodb.com/manual/reference/explain-results/#covered-queries
        s.totalDocsExamined.should.equal(0);
      });
    }); // end getHeads

    // FIXME: skipped due to pending removal of this method
    describe.skip('aggregateHistory', () => {
      it('produces a result', async () => {
        const {getHead} = _getEventMethods();
        const [creatorId] = testCreatorIds;
        const head = await getHead({creatorId});
        const [{meta: {eventHash: startHash}}] = head;
        const startParentHash = [startHash];
        const {aggregateHistory} = _getEventMethods();
        const creatorRestriction = [{creator: creatorId, generation: 0}];
        const r = await aggregateHistory(
          {creatorRestriction, startHash, startParentHash});
        r.should.have.length(4);
      });
      it('is properly indexed', async () => {
        const {getHead} = _getEventMethods();
        const [creatorId] = testCreatorIds;
        const head = await getHead({creatorId});
        const [{meta: {eventHash: startHash}}] = head;
        const startParentHash = [startHash];
        const {aggregateHistory} = _getEventMethods();
        const creatorRestriction = [{creator: creatorId, generation: 0}];
        const r = await aggregateHistory(
          {creatorRestriction, explain: true, startHash, startParentHash});
        should.exist(r);
        // TOOD: make assertions about report, however details are scant for
        // $graphLookup
      });
    }); // end aggregateHistory

    describe('getMergeEventHashes', () => {
      it('produces a result', async () => {
        const {getMergeEventHashes} = _getEventMethods();
        const blockHeight = 1;
        const r = await getMergeEventHashes({blockHeight});
        r.should.be.an('array');
        r.should.have.length(1);
        const [eventHash] = r;
        eventHash.should.be.a('string');
      });
      it('is properly indexed', async () => {
        const {getMergeEventHashes} = _getEventMethods();
        const blockHeight = 1;
        const r = await getMergeEventHashes({blockHeight, explain: true});
        const {executionStats: s} = r;
        const {indexName} = r.queryPlanner.winningPlan.inputStage;
        indexName.should.equal('event.continuity2017.blockHeight.mergeEvent');
        s.nReturned.should.equal(1);
        s.totalKeysExamined.should.equal(1);
        s.totalDocsExamined.should.equal(0);
      });
    }); // end getMergeEventHashes

    describe('getMergeEventPeers', () => {
      it('produces a result', async () => {
        const {getMergeEventPeers} = _getEventMethods();
        const blockHeight = 1;
        const r = await getMergeEventPeers({blockHeight});
        r.should.be.an('array');
        r.should.have.length(1);
        const [creatorId] = r;
        // the only creatorId in the network
        creatorId.should.equal(testCreatorIds[0]);
      });
      it('is properly indexed', async () => {
        const {getMergeEventPeers} = _getEventMethods();
        const blockHeight = 1;
        const r = await getMergeEventPeers({blockHeight, explain: true});
        const {executionStats: s} = r;
        const {indexName} = r.queryPlanner.winningPlan.inputStage;
        indexName.should.equal('event.continuity2017.blockHeight.mergeEvent');
        s.nReturned.should.equal(1);
        s.totalKeysExamined.should.equal(1);
        s.totalDocsExamined.should.equal(0);
      });
    }); // end getMergeEventPeers

    // FIXME: skipped due to pending removal of this method
    describe.skip('getStartHash', () => {
      it('produces a result', async () => {
        const {getStartHash} = _getEventMethods();
        const [creatorId] = testCreatorIds;
        const targetGeneration = 1;
        const r = await getStartHash({creatorId, targetGeneration});
        r.should.be.a.string;
      });
      it('is properly indexed', async () => {
        const {getStartHash} = _getEventMethods();
        const [creatorId] = testCreatorIds;
        const targetGeneration = 1;
        const r = await getStartHash(
          {creatorId, explain: true, targetGeneration});
        const {executionStats: s} = r;
        const {indexName} = r.queryPlanner.winningPlan.inputStage.inputStage;
        indexName.should.equal('event.continuity2017.type.1');
        s.nReturned.should.equal(1);
        s.totalKeysExamined.should.equal(1);
        s.totalDocsExamined.should.equal(0);
      });
    }); // end getStartHash

    describe('hasOutstandingRegularEvents', () => {
      it('produces a result', async () => {
        const {hasOutstandingRegularEvents} = _getEventMethods();
        const r = await hasOutstandingRegularEvents();
        r.should.be.false;
      });
      it('is properly indexed', async () => {
        const {hasOutstandingRegularEvents} = _getEventMethods();
        const r = await hasOutstandingRegularEvents({explain: true});
        const {executionStats: s} = r;
        const projectionStage =
          r.queryPlanner.winningPlan.inputStage.inputStage;
        projectionStage.stage.should.equal('PROJECTION_DEFAULT');
        const orStage = projectionStage.inputStage;
        orStage.stage.should.equal('OR');
        orStage.inputStages.length.should.equal(2);
        for(const inputStage of orStage.inputStages) {
          const {indexName} = inputStage;
          indexName.should.equal('event.continuity2017.nonConsensusEvents');
        }
        s.nReturned.should.equal(0);
        s.totalKeysExamined.should.equal(0);
        s.totalDocsExamined.should.equal(0);
      });
    }); // end hasOutstandingRegularEvents

    describe('setEffectiveConfiguration', () => {
      it('is properly indexed', async () => {
        const {setEffectiveConfiguration} = _getEventMethods();
        const r = await setEffectiveConfiguration(
          {blockHeight: 0, explain: true, sequence: 0});
        const {executionStats: s} = r;
        const {indexName} = r.queryPlanner.winningPlan.inputStage.inputStage;
        indexName.should.equal('event.continuity2017.effectiveConfiguration');
        s.nReturned.should.equal(1);
        s.totalKeysExamined.should.equal(1);
        s.totalDocsExamined.should.equal(1);
      });
      it('produces a result', async () => {
        const {setEffectiveConfiguration} = _getEventMethods();
        const r = await setEffectiveConfiguration(
          {blockHeight: 0, sequence: 0});
        should.exist(r.hasEffectiveConfigurationEvent);
        r.hasEffectiveConfigurationEvent.should.be.a('boolean');
        r.hasEffectiveConfigurationEvent.should.be.true;
      });
    });
  }); // end event APIs

  describe('Block APIs', () => {
    describe('check plugin methods', () => {
      it('all the plugin methods are properly bound', () => {
        should.exist(ledgerNode.storage.blocks.plugins['continuity-storage']);
        const pluginMethods = Object.keys(
          ledgerNode.storage.blocks.plugins['continuity-storage']);
        pluginMethods.should.have.same.members(blockMethods);
      });
    });
    describe('getConsensusProofPeers', () => {
      it('produces a result', async () => {
        const {getConsensusProofPeers} = _getBlockMethods();
        const r = await getConsensusProofPeers({blockHeight: 1});
        const [peer] = r;
        // the only peer in this network
        peer.should.equal(testCreatorIds[0]);
      });
      it('is indexed properly', async () => {
        const {getConsensusProofPeers} = _getBlockMethods();
        const r = await getConsensusProofPeers({blockHeight: 1, explain: true});
        const {indexName} = r.stages[0].$cursor.queryPlanner
          .winningPlan.inputStage;
        indexName.should.equal('block.blockHeight.core.1');
      });
    });
  }); // end block APIs
});

function _getBlockMethods() {
  return ledgerNode.storage.blocks.plugins['continuity-storage'];
}
function _getEventMethods() {
  return ledgerNode.storage.events.plugins['continuity-storage'];
}
