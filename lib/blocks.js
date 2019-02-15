/*!
 * Copyright (c) 2017-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const api = {};
module.exports = api;

api.getConsensusProofPeers = async function({blockHeight, explain = false}) {
  const cursor = await this.collection.aggregate([
    {$match: {'block.blockHeight': blockHeight}},
    {$project: {_id: 0, 'block.consensusProofHash': 1}},
    {$limit: 1},
    {$lookup: {
      from: this.eventCollection.s.name,
      localField: 'block.consensusProofHash',
      foreignField: 'meta.eventHash',
      as: 'peers'
    }},
    {$unwind: '$peers'},
    {$group: {_id: '$peers.meta.continuity2017.creator'}},
  ], {allowDiskUse: true});
  if(explain) {
    return cursor.explain('executionStats');
  }
  const records = await cursor.toArray();
  return records.map(r => r._id);
};
