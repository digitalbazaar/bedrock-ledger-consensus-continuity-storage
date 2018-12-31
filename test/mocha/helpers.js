/*
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const database = require('bedrock-mongodb');
const uuid = require('uuid/v4');

const api = {};
module.exports = api;

api.addOperation = ({count = 1, ledgerNode, opTemplate}, callback) => {
  const operations = {};
  async.timesSeries(count, (i, callback) => {
    const operation = bedrock.util.clone(opTemplate);
    // this creator is a required part of the operation
    operation.creator = ledgerNode._peerId;
    operation.record.id = `https://example.com/event/${uuid()}`;
    // this creator is just an arbitrary field in the record
    operation.record.creator = uuid();
    ledgerNode.operations.add({operation}, (err, result) => {
      if(err) {
        return callback(err);
      }
      operations[result.meta.operationHash] = operation;
      callback();
    });
  }, err => callback(err, operations));
};

api.prepareDatabase = function(mockData, callback) {
  async.series([
    callback => {
      api.removeCollections([
        'identity', 'eventLog', 'ledger', 'ledgerNode', 'continuity2017_key',
        'continuity2017_manifest', 'continuity2017_vote', 'continuity2017_voter'
      ], callback);
    },
  ], callback);
};

api.removeCollections = function(collections, callback) {
  const collectionNames = [].concat(collections);
  database.openCollections(collectionNames, () => {
    async.each(collectionNames, function(collectionName, callback) {
      if(!database.collections[collectionName]) {
        return callback();
      }
      database.collections[collectionName].remove({}, callback);
    }, function(err) {
      callback(err);
    });
  });
};

api.runWorkerCycle = ({consensusApi, nodes, series = false}, callback) => {
  const func = series ? async.eachSeries : async.each;
  func(nodes, (ledgerNode, callback) =>
    consensusApi._worker._run(ledgerNode, callback), callback);
};

/*
 * execute the worker cycle until there are no non-consensus
 * events of type `WebLedgerOperationEvent` or `WebLedgerConfigurationEvent`
 * and the blockHeight on all nodes are the same. It is expected that
 * there will be various numbers of non-consensus events of type
 * `ContinuityMergeEvent` on a settled network.
 */
api.settleNetwork = ({consensusApi, nodes, series = false}, callback) => {
  async.doWhilst(callback => {
    async.auto({
      workCycle: callback => api.runWorkerCycle(
        {consensusApi, nodes, series}, err => {
          if(err && err.name !== 'LedgerConfigurationChangeError') {
            return callback(err);
          }
          callback();
        }),
      operationEvents: ['workCycle', (results, callback) => {
        async.map(nodes, (ledgerNode, callback) => {
          ledgerNode.storage.events.getCount({
            consensus: false, type: 'WebLedgerOperationEvent'
          }, callback);
        }, (err, result) => {
          if(err) {
            return callback(err);
          }
          // all nodes should have zero non-consensus regular events
          callback(null, result.every(c => c === 0));
        });
      }],
      configEvents: ['operationEvents', (results, callback) => {
        async.map(nodes, (ledgerNode, callback) => {
          ledgerNode.storage.events.getCount({
            consensus: false, type: 'WebLedgerConfigurationEvent'
          }, callback);
        }, (err, result) => {
          if(err) {
            return callback(err);
          }
          // all nodes should have zero non-consensus configuration events
          callback(null, result.every(c => c === 0));
        });
      }],
      blocks: ['configEvents', (results, callback) => {
        async.map(nodes, (ledgerNode, callback) => {
          ledgerNode.storage.blocks.getLatestSummary(callback);
        }, (err, result) => {
          if(err) {
            return callback(err);
          }
          const blockHeights = result.map(s => s.eventBlock.block.blockHeight);
          // all nodes should have the same latest blockHeight
          callback(null, blockHeights.every(b => b === blockHeights[0]));
        });
      }]
    }, callback);
  }, results => {
    return !(results.operationEvents && results.configEvents && results.blocks);
  }, callback);
};

api.use = (plugin, callback) => {
  let p;
  try {
    p = brLedgerNode.use(plugin);
  } catch(e) {
    return callback(e);
  }
  callback(null, p);
};
