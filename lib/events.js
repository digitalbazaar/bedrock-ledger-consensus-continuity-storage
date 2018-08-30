/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

// const {promisify} = require('util');

const api = {};
module.exports = api;

api.getHead = async function({creatorId, explain = false}) {
  // NOTE: all merge events are assigned a generation
  const query = {
    'meta.continuity2017.type': 'm',
    'meta.continuity2017.creator': creatorId
  };
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
