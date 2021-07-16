/*!
 * Copyright (c) 2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const api = {};
module.exports = api;

api.getWitnessConversions = async function({
  nonWitnessEvents, explain = false
} = {}) {
  if(nonWitnessEvents.length === 0) {
    return [];
  }

  // query to discover if any of the non-witness events were created by
  // a peer that became a witnesses after the block height during which
  // the event was created (`basisBlockHeight + 1`)
  const nonWitnesses = [];
  const $or = [];
  for(const eventRecord of nonWitnessEvents) {
    const {
      event: {basisBlockHeight},
      meta: {continuity2017: {creator}}
    } = eventRecord;
    $or.push({
      'meta.continuity2017.witness': creator,
      'block.blockHeight': {$gt: basisBlockHeight + 1}
    });
    nonWitnesses.push(creator);
  }

  /* Since our block records include an array of witnesses, it is possible
  for each `creator` in our `$or` array to match across multiple blocks. This
  could cause us to get results where the block height for a block is NOT
  greater than the `basisBlockHeight + 1` required for a particular `creator`
  if that creator appears in an earlier block with another matching creator.

  Therefore, we reverse sort our results by block height and select the
  greatest block height for every `creator`. Now, this will not necessarily
  result in us getting back the *lowest* block height at which a particular
  creator became a witness *after* the block height during which the related
  non-witness event was created (`basisBlockHeight + 1`). However, this is ok
  because in order for this to be a problem, it would have to be the case
  that the event reaches consensus or is needed to reach consensus prior
  to the block height we return from this function and therefore select as
  its `requiredBlockHeight`.

  Suppose there's a non-witness event, E, created by peer, P, at
  `E.basisBlockHeight + 1`, BH. Now suppose that P becomes a witness at
  `BH + H1` and later again at `BH + H3`.

  There are two cases to consider for E that would be problematic:

  1. E reached consensus prior to `BH + H3`.

  2. E is needed to create a block with block height `BH + H2` where
    `H1 < H2 < H3`.

  In both cases, our local peer would be unable to serve E to a requesting
  peer until a point after which it reaches consensus or is needed to reach
  consensus, eliminating our ability to help the requesting peer reach
  consensus.

  Assumption 1:

  In order for the database query below to select `BH + H3`, it MUST be the
  case that `BH + H3` is the block height of a known block.

  Assumption 2:

  In order to evaluate E we MUST NOT have already evaluated and accepted E.

  Consider case 1 (E reached consensus prior to `BH + H3`):

  By Assumption 1, we MUST have seen block `BH + H3`. This means we MUST
  have seen and accepted E, since it reached consensus before `BH + H3`.
  However, by Assumption 2, we MUST NOT have seen and accepted E since we are
  evaluating it. This is a contradiction so case 1 cannot happen.

  Consider case 2 (E is needed to create block `BH + H2`):

  By Assumption 1, we MUST have seen block `BH + H3`. This means we MUST
  have seen and accepted E, since it is required to create `BH + H2` and
  `H2 < H3`. However, by Assumption 2, we MUST NOT have seen and accepted E
  since we are evaluating it. This is a contradiction so case 2 cannot happen.

  In both cases, our local peer should continue to be able to help other
  peers reach consensus. */

  // FIXME: make this a covered query
  const cursor = this.collection.aggregate([
    {
      $match: {$or}
    },
    // order to enable selection of the latest block height
    {
      $sort: {'block.blockHeight': -1}
    },
    // group by witness array and latest block height
    {
      $group: {
        _id: '$meta.continuity2017.witness',
        blockHeight: {$first: '$block.blockHeight'}
      }
    },
    // unwind *after* `$group` to try and reduce the number of docs being
    // operated on -- avoiding generating a document for every witness found
    // (including those not queried for) for *every block* vs. a single
    // document for every unique combination of witnesses that includes a
    // peer we were looking for
    {
      $unwind: {path: '$_id'}
    },
    // filter out witnesses we are not interested in
    {
      $match: {_id: {$in: nonWitnesses}}
    },
    // select maximum block height for the witnesses we are interested in
    {
      $group: {
        _id: '$_id',
        blockHeight: {$max: '$blockHeight'}
      }
    },
    // map `_id` back to `witness`
    {
      $project: {
        _id: 0,
        witness: '$_id',
        blockHeight: '$blockHeight'
      }
    }
  ], {allowDiskUse: true});
  if(explain) {
    cursor.explain('executionStats');
  }
  return cursor.toArray();
};

// returns all peer IDs from `peerIds` that have been witnesses
api.haveBeenWitnesses = async function({peerIds, explain = false} = {}) {
  // FIXME: make this a covered query
  const query = {
    'meta.continuity2017.witness': {$in: [peerIds]}
  };
  const projection = {_id: 0, 'meta.continuity2017.witness': 1};
  const cursor = await this.collection.find(query, {projection}).limit(
    peerIds.length);
  if(explain) {
    return cursor.explain('executionStats');
  }
  const records = await cursor.toArray();
  const witnesses = new Set();
  for(const {meta: {continuity2017: {witness}}} of records) {
    for(const w of witness) {
      witnesses.add(w);
    }
  }
  const results = [];
  for(const peerId of peerIds) {
    if(witnesses.has(peerId)) {
      results.push(peerId);
    }
  }
  return results;
};
