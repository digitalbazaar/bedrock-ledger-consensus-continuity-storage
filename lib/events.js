/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
// const {promisify} = require('util');

const api = {};
module.exports = api;

api._stat = async function() {
  const r = await this.collection.aggregate(
    [{$indexStats: {}}, {$project: {key: 0, host: 0}}]).toArray();
  console.log('R', JSON.stringify(r, null, 2));
};

api.aggregateHistory = async function({
  creatorFilter, creatorRestriction, eventTypeFilter, explain = false,
  startHash}) {
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

  // genesisMerge should never be included in the history
  // FIXME: should not be necessary to add this
  // restrictSearchWithMatch.$nor.push({
  //   'meta.continuity2017.generation': 0
  // });
  const pipeline = [
    {$match: {'meta.eventHash': startHash}},
    {$graphLookup: {
      from: this.collection.s.name,
      startWith: '$meta.eventHash',
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

/**
 * Get the head based on the specified parameters.
 *
 * @param {string} [creatorId] the creator.
 * @param {integer} [generation] the head generation.
 * @param {boolean} explain return statistics for query profiling.
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
