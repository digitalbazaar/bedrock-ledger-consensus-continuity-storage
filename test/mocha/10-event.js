/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

// const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const helpers = require('./helpers');
const mockData = require('./mock.data');

const peers = [];
let ledgerNode;
const eventMethods = ['aggregateHistory', 'getHead', '_stat'];
const testEventHashes = [];
const testCreatorIds = [];

describe('Continuity Storage', () => {
  before(done => {
    helpers.prepareDatabase(mockData, done);
  });
  // get consensus plugin and create genesis ledger node
  let consensusApi;
  let genesisLedgerNode;
  const {ledgerConfiguration} = mockData;
  before(done => {
    async.auto({
      clean: callback =>
        helpers.removeCollections(['ledger', 'ledgerNode'], callback),
      consensusPlugin: callback => helpers.use('Continuity2017', callback),
      ledgerNode: ['clean', 'consensusPlugin', (results, callback) => {
        brLedgerNode.add(null, {ledgerConfiguration}, (err, ledgerNode) => {
          if(err) {
            return callback(err);
          }
          callback(null, ledgerNode);
        });
      }]
    }, (err, results) => {
      assertNoError(err);
      genesisLedgerNode = results.ledgerNode;
      consensusApi = results.consensusPlugin.api;
      peers.push(genesisLedgerNode);
      ledgerNode = genesisLedgerNode;
      done();
    });
  });
  before(function(done) {
    this.timeout(30000);
    const opTemplate = mockData.operations.alpha;
    async.auto({
      addOperation: callback => helpers.addOperation(
        {ledgerNode: genesisLedgerNode, opTemplate}, callback),
      settleNetwork: ['addOperation', (results, callback) =>
        helpers.settleNetwork(
          {consensusApi, nodes: peers, series: false}, callback)],
      getLatest: ['settleNetwork', (results, callback) =>
        async.map(peers, (ledgerNode, callback) =>
          ledgerNode.storage.blocks.getLatest((err, result) => {
            assertNoError(err);
            const eventBlock = result.eventBlock;
            should.exist(eventBlock.block);
            eventBlock.block.blockHeight.should.equal(1);
            eventBlock.block.event.should.be.an('array');
            // a regular event and a merge event
            eventBlock.block.event.should.have.length(2);
            // push a valid eventHash to testEventHashes, this is a merge event
            testEventHashes.push(eventBlock.block.event[0].treeHash);
            // this is a different merge event
            testCreatorIds.push(eventBlock.block.event[1].proof.creator);
            callback(null, eventBlock.meta.blockHash);
          }), callback)],
      testHash: ['getLatest', (results, callback) => {
        const blockHashes = results.getLatest;
        // the blockHash on every node should be the same
        blockHashes.every(h => h === blockHashes[0]).should.be.true;
        callback();
      }]
    }, err => {
      assertNoError(err);
      done();
    });
  });
  // add a config event
  before(function(done) {
    this.timeout(210000);
    const ledgerConfiguration = bedrock.util.clone(
      mockData.ledgerConfiguration);
    // FIXME: remove
    ledgerConfiguration.ledger =
      'urn:uuid:ca539f07-7013-490a-b730-cd81c5745edb';
    ledgerConfiguration.operationValidator = [{
      type: 'SignatureValidator2017',
      validatorFilter: [{
        type: 'ValidatorFilterByType',
        validatorFilterByType: ['CreateWebLedgerRecord']
      }],
      approvedSigner: ['urn:uuid:99bfc16e-fc92-4e65-8ecf-343f413766cc'],
      minimumSignaturesRequired: 1
    }];
    async.auto({
      changeConfig: callback => genesisLedgerNode.config.change(
        {ledgerConfiguration}, callback),
      settleNetwork: ['changeConfig', (results, callback) =>
        helpers.settleNetwork(
          {consensusApi, nodes: peers, series: false}, callback)],
      test: ['settleNetwork', (results, callback) => {
        async.map(peers, (ledgerNode, callback) =>
          ledgerNode.config.get(callback),
        (err, result) => {
          if(err) {
            return callback(err);
          }
          for(const c of result) {
            c.should.eql(ledgerConfiguration);
          }
          callback();
        });
      }],
    }, err => {
      assertNoError(err);
      done();
    });
  });
  describe('check plugin', () => {
    it('all the plugin methods are properly bound', () => {
      should.exist(ledgerNode.storage.events.plugins['continuity-storage']);
      const pluginMethods = Object.keys(
        ledgerNode.storage.events.plugins['continuity-storage']);
      pluginMethods.should.have.same.members(eventMethods);
    });
  }); // end check plugin

  describe('getHead', () => {
    it('returns the proper head', async () => {
      const getHead = _getMethod('getHead');
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
      should.not.exist(creator);
      generation.should.equal(2);
    });
    it('is properly indexed for creatorId parameter', async () => {
      const getHead = _getMethod('getHead');
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
      const getHead = _getMethod('getHead');
      const r = await getHead({generation: 0, explain: true});
      const {indexName} = r.queryPlanner.winningPlan.inputStage.inputStage
        .inputStage.inputStage;
      indexName.should.equal('event.continuity2017.type.1');
      const {executionStats: s} = r;
      s.nReturned.should.equal(1);
      s.totalKeysExamined.should.equal(2);
      // this happens exactly once to cache the genesis merge event
      s.totalDocsExamined.should.equal(1);
    });
  }); // end getHeads
  describe('aggregateHistory', () => {
    it('produces a result', async () => {
      const getHead = _getMethod('getHead');
      const [creatorId] = testCreatorIds;
      const head = await getHead({creatorId});
      const [{meta: {eventHash: startHash}}] = head;
      const aggregateHistory = _getMethod('aggregateHistory');
      const creatorRestriction = [{creator: creatorId, generation: 0}];
      const r = await aggregateHistory({creatorRestriction, startHash});
      r.should.have.length(4);
    });
    it('is properly indexed', async () => {
      const getHead = _getMethod('getHead');
      const [creatorId] = testCreatorIds;
      const head = await getHead({creatorId});
      const [{meta: {eventHash: startHash}}] = head;
      const aggregateHistory = _getMethod('aggregateHistory');
      const creatorRestriction = [{creator: creatorId, generation: 0}];
      const r = await aggregateHistory(
        {creatorRestriction, explain: true, startHash});
      should.exist(r);
      // TOOD: make assertions about report, however details are scant for
      // $graphLookup
    });
  });
});

function _getMethod(name) {
  return ledgerNode.storage.events.plugins['continuity-storage'][name];
}
