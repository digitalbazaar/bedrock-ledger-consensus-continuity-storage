/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');

const api = {};
module.exports = api;

api._stat = async function() {
  const r = await this.collection.aggregate(
    [{$indexStats: {}}, {$project: {key: 0, host: 0}}]).toArray();
  console.log('EVENT COLLECTION INDEXES', JSON.stringify(r, null, 2));
};

api.aggregateHistory = async function({
  creatorFilter, creatorRestriction, eventTypeFilter, explain = false,
  startParentHash}) {
  // regular events *should* be included, regardless of created
  const restrictSearchWithMatch = {
    $nor: []
  };
  if(creatorRestriction && creatorRestriction.length !== 0) {
    creatorRestriction.forEach(r => restrictSearchWithMatch.$nor.push({
      'meta.continuity2017.type': 'm',
      'meta.continuity2017.creator': r.creator,
      'meta.continuity2017.generation': {$lte: r.generation}
    }));
  }

  if(Array.isArray(creatorFilter) && creatorFilter.length !== 0) {
    restrictSearchWithMatch.$nor.push(
      {'meta.continuity2017.creator': {$in: creatorFilter}});
  }

  if(eventTypeFilter) {
    const type = eventTypeFilter === 'ContinuityMergeEvent' ? 'm' : 'r';
    restrictSearchWithMatch['meta.continuity2017.type'] = type;
  }
  const pipeline = [
    {$match: {
      'meta.eventHash': {$in: startParentHash}, 'meta.continuity2017.type': 'm'
    }},
    {$group: {
      _id: null,
      startWith: {$addToSet: '$meta.eventHash'}
    }},
    {$graphLookup: {
      from: this.collection.s.name,
      startWith: '$startWith',
      connectFromField: 'event.parentHash',
      connectToField: 'meta.eventHash',
      as: '_parents',
      restrictSearchWithMatch
    }},
    {$project: {
      _id: 0, '_parents.meta.eventHash': 1, '_parents.event.parentHash': 1
    }},
    {$unwind: '$_parents'},
    {$replaceRoot: {newRoot: '$_parents'}},
  ];
  const cursor = await this.collection.aggregate(
    pipeline, {allowDiskUse: true});
  if(explain) {
    return cursor.explain('executionStats');
  }
  return cursor.toArray();
};

// get the average time(ms) to consensus for the last <limit> merge events
// for the specified creatorId. The creatorId specified should be for the local
// voter/creator. This is because it is only for local events that we can
// compare `meta.created` and `meta.consensDate` and get a meaningful value.
// this is useful in monitoring tools like bedrock-ledger-test
// it is currently not being executed anywhere in the ledger core
// this is *not* a covered query and it involves inspecting <limit> documents
api.getAvgConsensusTime = async function(
  {creatorId, explain = false, limit = 100}) {
  const cursor = await this.collection.aggregate([
    {$match: {
      'meta.consensus': true, 'meta.continuity2017.type': 'm',
      'meta.continuity2017.creator': creatorId
    }},
    {$sort: {'meta.continuity2017.generation': -1}},
    {$limit: limit},
    {$project: {
      consensusTime: {$subtract: ['$meta.consensusDate', '$meta.created']}
    }},
    {$group: {
      _id: null,
      avgConsensusTime: {$avg: '$consensusTime'}
    }},
    {$project: {_id: 0}}
  ]);
  if(explain) {
    return cursor.explain('executionStats');
  }
  const [result] = await cursor.toArray();
  if(!result) {
    return null;
  }
  return {avgConsensusTime: Math.round(result.avgConsensusTime)};
};

/**
 * Get the head based on the specified parameters.
 *
 * @param {string} [creatorId] the creator.
 * @param {integer} [generation] the head generation.
 * @param {boolean} [explain] return statistics for query profiling.
 *
 * @returns {Promise} the head information.
 */
api.getHead = async function({creatorId, explain = false, generation}) {
  // NOTE: all merge events are assigned a generation
  const query = {
    'meta.continuity2017.type': 'm',
  };
  if(creatorId) {
    query['meta.continuity2017.creator'] = creatorId;
  }
  // must be able to query for generation === 0
  if(_.isNumber(generation)) {
    query['meta.continuity2017.generation'] = generation;
  }
  const projection = {
    _id: 0, 'meta.eventHash': 1, 'meta.continuity2017.generation': 1
  };
  const cursor = await this.collection.find(query, projection)
    .sort({'meta.continuity2017.generation': -1})
    .limit(1);
  if(explain) {
    return cursor.explain('executionStats');
  }
  return cursor.toArray();
};

api.getMergeEventHashes = async function({blockHeight, explain = false}) {
  const query = {
    'meta.blockHeight': blockHeight,
    'meta.continuity2017.type': 'm'
  };
  const projection = {_id: 0, 'meta.eventHash': 1};
  const cursor = await this.collection.find(query, projection);
  if(explain) {
    return cursor.explain('executionStats');
  }
  const records = await cursor.toArray();
  return records.map(e => e.meta.eventHash);
};

api.getMergeEventPeers = async function({blockHeight, explain = false}) {
  const query = {
    'meta.blockHeight': blockHeight,
    'meta.continuity2017.type': 'm'
  };
  if(explain) {
    const projection = {_id: 0, 'meta.continuity2017.creator': 1};
    return this.collection.find(query, projection).explain('executionStats');
  }
  return this.collection.distinct('meta.continuity2017.creator', query);
};

// used for node catchup
api.getStartHash = async function(
  {creatorId, explain = false, targetGeneration}) {
  const query = {
    'meta.continuity2017.type': 'm',
    'meta.continuity2017.creator': creatorId,
    'meta.continuity2017.generation': targetGeneration
  };
  const projection = {_id: 0, 'meta.eventHash': 1};
  const cursor = this.collection.find(query, projection).limit(1);
  if(explain) {
    return cursor.explain('executionStats');
  }
  const [{meta}] = await cursor.toArray();
  if(!meta) {
    return null;
  }
  return meta.eventHash;
};

// determine if there are any non-consensus events of type
// `r` (WebLedgerOperationEvent) or `c` (WebLedgerConfigurationEvent)
api.hasOutstandingRegularEvents = async function({explain = false} = {}) {
  // look for regular and configuration events without consensus
  const query = {
    'meta.continuity2017.type': {$in: ['c', 'r']},
    'meta.consensus': false,
  };
  const projection = {
    _id: 0, 'meta.consensus': 1
  };
  const cursor = await this.collection.find(query, projection).limit(1);
  if(explain) {
    return await cursor.explain('executionStats');
  }
  return await cursor.hasNext();
};

// the blockOrder of events was established in the consensus algorithm
// mark the last configuration event with the specified blockHeight with a
// proper sequence as valid
api.setEffectiveConfiguration = async function({blockHeight, sequence}) {
  const query = {
    'meta.continuity2017.type': 'c',
    'meta.blockHeight': blockHeight,
    'event.ledgerConfiguration.sequence': sequence,
  };
  const sort = {'meta.blockOrder': -1};
  const update = {$set: {'meta.validConfiguration': true}};
  const result = await this.collection.findAndModify(query, sort, update);
  const hasValidConfigurationEvent = !!result.lastErrorObject.n;
  return {hasValidConfigurationEvent};
};
