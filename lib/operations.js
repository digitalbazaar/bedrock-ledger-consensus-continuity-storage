/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const api = {};
module.exports = api;

// checks the database for records that match any of the given
// `operationSummaries`; this function MUST only called using operation hashes
// from events that have not been stored yet, such that it means that if any
// records match, the creator of those events has created one or more replays;
// only the peer IDs of creators of any replays will be returned
api.getOperationReplayers = async function({
  operationSummaries, explain = false
} = {}) {
  if(operationSummaries.length === 0) {
    return [];
  }

  // FIXME: make this a covered query
  const $or = [];
  for(const summary of operationSummaries) {
    const {creator, operationHashes} = summary;
    $or.push({
      'operation.creator': creator,
      'meta.operationHash': {$in: operationHashes}
    });
  }
  const cursor = this.collection.aggregate([
    // find events with the given operation data
    {
      $match: {$or}
    },
    // group by creator to return just `creator`
    {
      $group: {
        _id: '$meta.continuity2017.creator',
        // aggregate all found operation hashes
        operationHashes: {$addToSet: '$meta.operationHash'}
      }
    },
    {
      $project: {
        _id: 0,
        peerId: '$_id',
        operationHashes: 1
      }
    }
  ], {allowDiskUse: true});
  if(explain) {
    cursor.explain('executionStats');
  }
  return cursor.toArray();
};
