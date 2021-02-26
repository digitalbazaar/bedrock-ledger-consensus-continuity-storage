/*
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const database = require('bedrock-mongodb');
const uuid = require('uuid/v4');

const api = {};
module.exports = api;

api.addOperation = async ({count = 1, ledgerNode, opTemplate}) => {
  const operations = {};
  for(let i = 0; i < count; ++i) {
    const operation = bedrock.util.clone(opTemplate);
    // this creator is a required part of the operation
    operation.creator = ledgerNode._peerId;
    operation.record.id = `https://example.com/event/${uuid()}`;
    // this creator is just an arbitrary field in the record
    operation.record.creator = uuid();
    const result = await ledgerNode.operations.add({operation});
    operations[result.meta.operationHash] = operation;
  }
  return operations;
};

api.prepareDatabase = async function() {
  await api.removeCollections([
    'ledger', 'ledgerNode', 'continuity2017_local_peer'
  ]);
};

api.removeCollections = async function(collections) {
  const collectionNames = [].concat(collections);
  await database.openCollections(collectionNames);
  for(const collectionName of collectionNames) {
    await database.collections[collectionName].deleteMany({});
  }
};

api.runWorkerCycle = async (
  {consensusApi, nodes, series = false, targetCyclesPerNode = 1}) => {
  const promises = [];
  for(const ledgerNode of nodes) {
    const promise = _cycleNode(
      {consensusApi, ledgerNode, targetCycles: targetCyclesPerNode});
    if(series) {
      await promise;
    } else {
      promises.push(promise);
    }
  }
  await Promise.all(promises);
};

async function _cycleNode({consensusApi, ledgerNode, targetCycles = 1} = {}) {
  if(ledgerNode.stop) {
    return;
  }

  try {
    await consensusApi._worker._run({ledgerNode, targetCycles});
  } catch(err) {
    // if a config change is detected, do not run worker on that node again
    if(err && err.name === 'LedgerConfigurationChangeError') {
      ledgerNode.stop = true;
      return;
    }
    throw err;
  }
}

/*
 * execute the worker cycle until there are no non-consensus
 * events of type `WebLedgerOperationEvent` or `WebLedgerConfigurationEvent`
 * and the blockHeight on all nodes are the same. It is expected that
 * there will be various numbers of non-consensus events of type
 * `ContinuityMergeEvent` on a settled network.
 */
api.settleNetwork = async ({consensusApi, nodes, series = false} = {}) => {
  while(true) {
    await api.runWorkerCycle({consensusApi, nodes, series});

    // all nodes should have zero non-consensus regular events
    let promises = [];
    for(const ledgerNode of nodes) {
      promises.push(ledgerNode.storage.events.getCount({
        consensus: false, type: 'WebLedgerOperationEvent'
      }));
    }
    if((await Promise.all(promises)).some(c => c > 0)) {
      continue;
    }

    // all nodes should have zero non-consensus configuration events
    promises = [];
    for(const ledgerNode of nodes) {
      promises.push(ledgerNode.storage.events.getCount({
        consensus: false, type: 'WebLedgerConfigurationEvent'
      }));
    }
    if((await Promise.all(promises)).some(c => c > 0)) {
      continue;
    }

    // all nodes should have the same latest blockHeight
    promises = [];
    for(const ledgerNode of nodes) {
      promises.push(ledgerNode.storage.blocks.getLatestSummary());
    }
    const summaries = await Promise.all(promises);
    const blockHeights = summaries.map(s => s.eventBlock.block.blockHeight);
    if(blockHeights.every(b => b === blockHeights[0])) {
      break;
    }
  }
};

api.use = async plugin => {
  return brLedgerNode.use(plugin);
};
