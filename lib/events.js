/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
// const {promisify} = require('util');

const api = {};
module.exports = api;

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
    return cursor.explain("executionStats");
  }
  return cursor.toArray();
};
