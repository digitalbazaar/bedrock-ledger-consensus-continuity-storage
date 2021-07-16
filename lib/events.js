/*!
 * Copyright (c) 2017-2021 Digital Bazaar, Inc. All rights reserved.
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

api.findNewReplayers = async function({replayNumberMap, explain = false} = {}) {
  // for all replay numbers that are not `0`, we must check to see if a replay
  // has been detected via the block to be created by comparing against events
  // that have previously reached consensus with different replay numbers
  const $or = [];
  for(const [creator, localReplayNumber] of replayNumberMap) {
    if(localReplayNumber === 0) {
      // not a replay
      continue;
    }
    // query for a creator that has any event that has reached consensus with
    // a different replay number than the one given; if found, it is a new
    // replayer
    $or.push({
      'meta.continuity2017.creator': creator,
      'meta.continuity2017.type': 'm',
      'meta.continuity2017.localReplayNumber': {$ne: localReplayNumber}
    });
  }

  if($or.length === 0) {
    // no new replayers
    return [];
  }

  // FIXME: make this a covered query
  const cursor = this.collection.aggregate([
    {
      $match: {$or}
    },
    // group by creator to return just `creator`
    {
      $group: {_id: '$meta.continuity2017.creator'}
    },
    // limit number of results to number of peers
    {
      $limit: $or.length
    }
  ], {allowDiskUse: true});
  if(explain) {
    cursor.explain('executionStats');
  }
  const records = await cursor.toArray();
  return records.map(({_id}) => _id);
};

// get the average time(ms) to consensus for the last <limit> merge events
// for the specified peerId. The peerId specified should be for the local
// peer. This is because it is only for local events that we can
// compare `meta.created` and `meta.consensusDate` and get a meaningful value.
// this is useful in monitoring tools like bedrock-ledger-test
// it is currently not being executed anywhere in the ledger core
// this is *not* a covered query and it involves inspecting <limit> documents
api.getAvgConsensusTime = async function(
  {peerId, explain = false, limit = 100} = {}) {
  const cursor = await this.collection.aggregate([
    {$match: {
      'meta.consensus': true, 'meta.continuity2017.type': 'm',
      'meta.continuity2017.creator': peerId
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

// gets a commitment to a peer that has reached consensus that was created
// by a non-replayer
api.getCommitmentToPeer = async function({peerId, explain = false} = {}) {
  // FIXME: make this a covered query
  const query = {
    'event.peerCommitment': peerId,
    'meta.continuity2017.type': 'm',
    'meta.continuity2017.replayDetectedBlockHeight': -1,
    'meta.consensus': true
  };
  const projection = {
    _id: 0,
    'meta.continuity2017.creator': 1,
    'event.mergeHeight': 1,
    'meta.blockHeight': 1,
    'meta.eventHash': 1
  };
  const cursor = await this.collection.find(query, {projection}).limit(1);
  if(explain) {
    return cursor.explain('executionStats');
  }
  return cursor.toArray();
};

/*
// checks the database for records that match any of the given
// `configSummaries`; this function MUST only called using configs from
// events that have not been stored yet, such that it means that if any
// records match, the creator of those events has created one or more replays;
// only the peer IDs of creators of any replays will be returned
api.getConfigReplayers = async function({
  configSummaries, explain = false
} = {}) {
  if(configSummaries.length === 0) {
    return [];
  }

  // FIXME: make this a covered query
  const $or = [];
  for(const summary of configSummaries) {
    const {creator, basisBlockHeight, eventHashes} = summary;
    $or.push({
      'meta.continuity2017.creator': creator,
      'event.basisBlockHeight': basisBlockHeight,
      'meta.eventHash': {$in: eventHashes}
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
        eventHashes: {$addToSet: '$meta.eventHash'}
      }
    },
    {
      $project: {
        _id: 0,
        peerId: '$_id',
        eventHashes: 1
      }
    }
  ], {allowDiskUse: true});
  if(explain) {
    cursor.explain('executionStats');
  }
  return cursor.toArray();
}*/

// checks the database for records that match any of the given `treeHashes`;
// this function MUST only called using tree hashes from events that have
// not been stored yet, such that it means that if any records match, the
// creator of those events has created one or more forks; only the peer IDs of
// creators of any forks (aka "forkers") will be returned; `treeHashes` MUST
// NOT include the genesis hash, that must be passed separately if that hash
// is being checked -- along with `firstGenerationPeers` to check
api.getForkers = async function({
  treeHashes, firstGenerationPeers, genesisHash, explain = false
} = {}) {
  // FIXME: make this a covered query
  let $match = {
    'meta.continuity2017.type': 'm',
    'event.treeHash': {$in: treeHashes}
  };
  if(firstGenerationPeers.length > 0) {
    const $or = [$match];
    $match = {$or};
    for(const peerId of firstGenerationPeers) {
      $or.push({
        'meta.continuity2017.type': 'm',
        'event.treeHash': genesisHash,
        'meta.continuity2017.creator': peerId
      });
    }
  }
  const cursor = this.collection.aggregate([
    // find events with the given tree hashes
    {
      $match
    },
    // group by creator to return just `creator`
    {
      $group: {
        _id: '$meta.continuity2017.creator',
        // aggregate all found forked tree hashes
        treeHashes: {$addToSet: '$event.treeHash'}
      }
    },
    {
      $project: {
        _id: 0,
        peerId: '$_id',
        treeHashes: 1
      }
    }
  ], {allowDiskUse: true});
  if(explain) {
    cursor.explain('executionStats');
  }
  return cursor.toArray();
};

/**
 * Get the head based on the specified parameters.
 *
 * @param {string} [peerId] the ID of the peer that created the head;
 *   its creator.
 * @param {integer} [generation] the head generation.
 * @param {boolean} [explain] return statistics for query profiling.
 *
 * @returns {Promise} the head information.
 */
api.getHead = async function({peerId, explain = false, generation} = {}) {
  // NOTE: all merge events are assigned a generation
  const query = {
    'meta.continuity2017.type': 'm',
  };
  if(peerId) {
    query['meta.continuity2017.creator'] = peerId;
  }
  // must be able to query for generation === 0
  if(_.isNumber(generation)) {
    query['meta.continuity2017.generation'] = generation;
  }
  const projection = {
    _id: 0,
    // FIXME: note this field is not presently covered by the index
    'event.basisBlockHeight': 1,
    // FIXME: note this field is not presently covered by the index
    'event.mergeHeight': 1,
    // FIXME: note this field is not presently covered by the index
    'event.parentHashCommitment': 1,
    'meta.consensus': 1,
    'meta.eventHash': 1,
    'meta.continuity2017.creator': 1,
    'meta.continuity2017.generation': 1,
    // FIXME: note these fields are not presently covered by the index
    'meta.continuity2017.isLocalContributor': 1,
    'meta.continuity2017.lastLocalContributor': 1
  };
  const cursor = await this.collection.find(query, {projection})
    .sort({'meta.continuity2017.generation': -1})
    .limit(1);
  if(explain) {
    return cursor.explain('executionStats');
  }
  return cursor.toArray();
};

// given a set of heads from an untrusted peer, returning which ones are
// known to be valid, the rest having an unknown status and will be ignored;
// `peerHeads` is an array with event hashes identifying the heads
api.getKnownPeerHeads = async function({peerHeads} = {}) {
  // no heads given, return immediately
  if(peerHeads.size === 0) {
    return {knownHeads: []};
  }

  // FIXME: make sure this is a covered query
  // FIXME: we could also limit the search by blockHeight and consensus=false
  // ... determine if that would help/hurt performance
  const records = await this.collection.find({
    'meta.eventHash': {$in: peerHeads},
    'meta.continuity2017.type': 'm'
  }).project({
    _id: 0,
    // Note: `meta.eventHash` is not presently needed in the output
    'meta.continuity2017.creator': 1,
    'meta.continuity2017.generation': 1,
    'meta.continuity2017.localReplayNumber': 1
  }).toArray();
  const knownHeads = [];
  for(const {meta} of records) {
    const {
      continuity2017: {creator, generation, localReplayNumber}
    } = meta;
    const head = {creator, generation, localReplayNumber};
    knownHeads.push(head);
  }
  return {knownHeads};
};

// gets the latest valid commitment that has reached consensus for the given
// creator, provided that it was for an event created by a peer that has not
// been detected as a replayer; this is for restoring `mergeCommitment` state
// when a worker initializes
api.getLatestParentHashCommitment = async function({
  creator, minGeneration
} = {}) {
  // fetch latest consensus parent hash commitment from creator
  const [record] = await this.collection.find({
    'meta.continuity2017.type': 'm',
    'meta.continuity2017.creator': creator,
    'meta.continuity2017.generation': {$gte: minGeneration},
    'meta.consensus': true,
    'meta.continuity2017.hasParentHashCommitment': true,
  }).sort({'meta.continuity2017.generation': -1}).limit(1).project({
    _id: 0,
    'meta.continuity2017.generation': 1,
    'event.parentHashCommitment': 1,
    'meta.eventHash': 1
  }).toArray();
  if(!record) {
    return null;
  }

  // ensure the commitment is for a non-replayer
  const {
    event: {parentHashCommitment},
    meta: {eventHash, continuity2017: {generation}}
  } = record;
  const [eventRecord] = await this.collection.find({
    'meta.eventHash': parentHashCommitment[0]
  }).project({
    _id: 0,
    'meta.blockHeight': 1,
    'meta.continuity2017.replayDetectedBlockHeight': 1
  }).limit(1).toArray();
  if(!eventRecord) {
    return null;
  }

  const result = {eventHash, generation, parentHashCommitment};

  const {
    meta: {blockHeight, continuity2017: {replayDetectedBlockHeight}}
  } = eventRecord;
  if(replayDetectedBlockHeight === -1) {
    // did not commit to a replayer
    return result;
  }
  if(blockHeight === -1 || blockHeight >= replayDetectedBlockHeight) {
    // committed to a replayer
    return null;
  }
  // did not commit to a replayer
  return result;
};

api.getLatestReplays = async function({peerIds, explain = false} = {}) {
  // FIXME: make this a covered query
  const cursor = this.collection.aggregate([
    {
      $match: {
        'meta.continuity2017.creator': {$in: peerIds},
        'meta.continuity2017.type': 'm'
      }
    },
    // sort by `localReplayNumber`, descending, to get highest one per creator
    // Note: Other fields are present in the sort to ensure the index is
    // used -- it does not affect the output because we group by creator
    {
      $sort: {
        'meta.continuity2017.creator': 1,
        'meta.continuity2017.type': 1,
        'meta.continuity2017.localReplayNumber': -1
      }
    },
    // group by creator to return just `creator`
    {
      $group: {
        _id: '$meta.continuity2017.creator',
        // can safely use `$first` here because we sorted by `localReplayNumber`
        eventHash: {$first: '$meta.continuity2017.localReplayNumber'}
      }
    },
    // limit number of results to number of peers
    {
      $limit: peerIds.length
    },
    // map `_id` to `peerId`
    {
      $project: {
        _id: 0,
        peerId: '$_id',
        localReplayNumber: '$meta.continuity2017.localReplayNumber'
      }
    }
  ], {allowDiskUse: true});
  if(explain) {
    cursor.explain('executionStats');
  }
  return cursor.toArray();
};

api.getMergeEventHashes = async function({blockHeight, explain = false} = {}) {
  const query = {
    'meta.blockHeight': blockHeight,
    'meta.continuity2017.type': 'm'
  };
  const projection = {_id: 0, 'meta.eventHash': 1};
  const cursor = await this.collection.find(query, {projection});
  if(explain) {
    return cursor.explain('executionStats');
  }
  const records = await cursor.toArray();
  return records.map(e => e.meta.eventHash);
};

api.getMergeEventPeers = async function({blockHeight, explain = false} = {}) {
  const query = {
    'meta.blockHeight': blockHeight,
    'meta.continuity2017.type': 'm'
  };
  if(explain) {
    const projection = {_id: 0, 'meta.continuity2017.creator': 1};
    return this.collection.find(query, {projection}).explain('executionStats');
  }
  return this.collection.distinct('meta.continuity2017.creator', query);
};

/**
 * Get the most recent local event number.
 *
 * @param {boolean} [explain=false] return statistics for query profiling.
 *
 * @returns {Promise<object>} an object with `localEventNumber` set to the
 *   most recent local event number.
 */
api.getMostRecentLocalEventNumber = async function({explain = false} = {}) {
  const projection = {_id: 0, 'meta.continuity2017.localEventNumber': 1};
  const sort = {'meta.continuity2017.localEventNumber': -1};
  const cursor = await this.collection.find({}, {projection})
    .sort(sort).limit(1);
  if(explain) {
    return cursor.explain('executionStats');
  }

  const records = await cursor.toArray();
  if(records.length === 0) {
    return {localEventNumber: 0};
  }

  const [{meta: {continuity2017: {localEventNumber}}}] = records;
  return {localEventNumber};
};

// gets non-consensus events that can eventually be merged (excludes any
// events by detected replayers)
api.getNonConsensusEvents = async function({basisBlockHeight} = {}) {
  // Note: If `replayDetectedBlockHeight <= basisBlockHeight` then the events
  // can never be legally merged; omit these from valid non-consensus events
  return this.collection.find({
    'meta.consensus': false,
    $or: [
      {'meta.continuity2017.replayDetectedBlockHeight': -1},
      {'meta.continuity2017.replayDetectedBlockHeight': {
        $gt: basisBlockHeight
      }}
    ]
  }).project({
    // FIXME: check to see if this is still a covered query or if we need it
    // it to be (it may not be called often enough)
    _id: 0,
    'event.basisBlockHeight': 1,
    'event.mergeHeight': 1,
    'event.parentHash': 1,
    'event.parentHashCommitment': 1,
    'event.treeHash': 1,
    'meta.eventHash': 1,
    'meta.continuity2017.creator': 1,
    'meta.continuity2017.generation': 1,
    'meta.continuity2017.isLocalContributor': 1,
    'meta.continuity2017.lastLocalContributor': 1,
    'meta.continuity2017.localReplayNumber': 1,
    'meta.continuity2017.localEventNumber': 1,
    'meta.continuity2017.replayDetectedBlockHeight': 1,
    'meta.continuity2017.type': 1
  }).toArray();
};

api.getParentHashCommitments = async function({
  nonWitnessHashes, blockHeight, explain = false
} = {}) {
  if(nonWitnessHashes.length === 0) {
    return [];
  }

  // FIXME: make this a covered query
  const cursor = this.collection.aggregate([
    {
      $match: {
        'event.parentHashCommitment': {$in: nonWitnessHashes},
        'meta.continuity2017.type': 'm',
        'meta.blockHeight': {$gt: -1, $lte: blockHeight}
      }
    },
    // order to enable selection of the earliest commitments to reach consensus
    {
      $sort: {'meta.blockHeight': 1}
    },
    // allow for multiple parent hash commitments (current implementation
    // supports just 1)
    {
      $unwind: {path: '$event.parentHashCommitment'}
    },
    // mark whether or not a particular commitment is valid; its `blockHeight`
    // must be less than the `replayDetectedBlockHeight` (or no replay
    // detected at all indicated by `-1`)
    {
      $project: {
        parentHashCommitment: '$event.parentHashCommitment',
        blockHeight: '$meta.blockHeight',
        valid: {
          $or: [{
            $eq: ['$meta.continuity2017.replayDetectedBlockHeight', -1]
          }, {
            $lt: [
              '$meta.blockHeight',
              '$meta.continuity2017.replayDetectedBlockHeight'
            ]
          }]
        }
      }
    },
    // group by committed hash and `valid` status using the earliest
    // `blockHeight`
    {
      $group: {
        _id: {
          parentHashCommitment: '$parentHashCommitment',
          valid: '$valid'
        },
        blockHeight: {$first: '$blockHeight'}
      }
    },
    // map `_id` back to `parentHashCommitment` and `valid`
    {
      $project: {
        _id: 0,
        parentHashCommitment: '$_id.parentHashCommitment',
        valid: '$_id.valid',
        blockHeight: '$blockHeight'
      }
    }
  ], {allowDiskUse: true});
  if(explain) {
    cursor.explain('executionStats');
  }
  return cursor.toArray();
};

api.getSortedEventSummaries = async function({
  minBlockHeight, minLocalEventNumber = 0,
  limit = 100, explain = false
} = {}) {
  const cursor = this.collection.find({
    // ensure we search both for events that have not reached consensus
    // and any that may be concurrently reaching consensus via a non-atomic
    // database update; we use `meta.blockHeight: -1` to avoid having to
    // include `consensus` in the index used for this query
    $or: [
      {'meta.blockHeight': -1},
      {'meta.blockHeight': {$gte: minBlockHeight}}
    ],
    'meta.continuity2017.localEventNumber': {$gte: minLocalEventNumber}
  }, {
    projection: {
      _id: 0,
      'meta.continuity2017.localEventNumber': 1,
      'meta.continuity2017.type': 1,
      'meta.continuity2017.creator': 1,
      'meta.continuity2017.localReplayNumber': 1,
      'meta.continuity2017.generation': 1,
      'meta.continuity2017.requiredBlockHeight': 1,
      'event.basisBlockHeight': 1,
      'event.parentHash': 1,
      'meta.eventHash': 1
    }
  }).sort({'meta.continuity2017.localEventNumber': 1}).limit(limit);
  if(explain) {
    cursor.explain('executionStats');
  }
  return cursor.toArray();
};

api.hasOutstandingParentHashCommitments = async function({
  basisBlockHeight = 0, explain = false
} = {}) {
  // look for any events with parent hash commitments that haven't reached
  // consensus yet
  const query = {
    $or: [{
      'meta.consensus': false,
      'meta.continuity2017.replayDetectedBlockHeight': -1,
      'meta.continuity2017.type': 'm',
      'meta.continuity2017.hasParentHashCommitment': true
    }, {
      'meta.consensus': false,
      'meta.continuity2017.replayDetectedBlockHeight': {
        $gt: basisBlockHeight
      },
      'meta.continuity2017.type': 'm',
      'meta.continuity2017.hasParentHashCommitment': true
    }]
  };
  const projection = {
    _id: 0, 'meta.consensus': 1
  };
  const cursor = await this.collection.find(query, {projection}).limit(1);
  if(explain) {
    return cursor.explain('executionStats');
  }
  return cursor.hasNext();
};

// determine if there are any non-consensus events of type
// `r` (WebLedgerOperationEvent) or `c` (WebLedgerConfigurationEvent)
api.hasOutstandingRegularEvents = async function({
  basisBlockHeight = 0, explain = false
} = {}) {
  // look for regular and configuration events without consensus that can
  // be merged (replay not detected yet)
  const query = {
    $or: [{
      'meta.consensus': false,
      'meta.continuity2017.replayDetectedBlockHeight': -1,
      'meta.continuity2017.type': {$in: ['c', 'r']}
    }, {
      'meta.consensus': false,
      'meta.continuity2017.replayDetectedBlockHeight': {
        $gt: basisBlockHeight
      },
      'meta.continuity2017.type': {$in: ['c', 'r']}
    }]
  };
  const projection = {
    _id: 0, 'meta.consensus': 1
  };
  const cursor = await this.collection.find(query, {projection}).limit(1);
  if(explain) {
    return cursor.explain('executionStats');
  }
  return cursor.hasNext();
};

api.markNewReplayers = async function({replayers, blockHeight} = {}) {
  // FIXME: this query could take a *long* time for replayers with many
  // events -- is that a legitimate concern -- can we improve this at all?

  // FIXME: make this a covered query
  const result = await this.collection.updateMany({
    'meta.continuity2017.creator': {$in: replayers}
  }, {
    $set: {'meta.continuity2017.replayDetectedBlockHeight': blockHeight}
  });
  return result;
};

// if `creator` is passed, then non-consensus commitments by that particular
// creator will match, otherwise, only consensus commitments will match
api.peerHasCommitmentOrHead = async function({
  peerId, creator, limit = 1, explain = false
} = {}) {
  // FIXME: make this a covered query
  const $or = [{
    'event.peerCommitment': peerId,
    'meta.continuity2017.type': 'm',
    'meta.continuity2017.replayDetectedBlockHeight': -1,
    'meta.consensus': true
  }];
  if(creator) {
    $or.push({
      ...$or[0],
      'meta.consensus': false,
      'meta.continuity2017.creator': creator,
    });
  }
  $or.push({
    'meta.continuity2017.type': 'm',
    'meta.continuity2017.creator': peerId
  });
  const query = {$or};
  const projection = {_id: 0, 'meta.continuity2017.type': 1};
  const cursor = await this.collection.find(query, {projection}).limit(limit);
  if(explain) {
    return cursor.explain('executionStats');
  }
  return cursor.hasNext();
};

// the blockOrder of events was established in the consensus algorithm
// mark the last configuration event with the specified blockHeight with a
// proper sequence as valid
api.setEffectiveConfiguration = async function({
  blockHeight, explain = false, sequence
} = {}) {
  const query = {
    'meta.continuity2017.type': 'c',
    'meta.blockHeight': blockHeight,
    'event.ledgerConfiguration.sequence': sequence,
  };
  const sort = {'meta.blockOrder': -1};
  if(explain) {
    return this.collection.find(query).sort(sort).limit(1)
      .explain('executionStats');
  }
  const update = {$set: {'meta.effectiveConfiguration': true}};
  const result = await this.collection.findOneAndUpdate(query, update, {sort});
  const hasEffectiveConfigurationEvent = !!result.lastErrorObject.n;
  return {hasEffectiveConfigurationEvent};
};

/**
 * Sets the Required Block Height for a block.
 *
 * @param {object} options - Options to use.
 * @param {Array<string>} options.witnesses - An array of witness ids.
 * @param {number} options.blockHeight - A blockHeight to set.
 *
 * @returns {Promise<object>} The result of the operation.
 */
api.setRequiredBlockHeight = async function({witnesses, blockHeight} = {}) {
  // FIXME: make this a covered query
  const result = await this.collection.updateMany({
    'meta.continuity2017.creator': {$in: witnesses},
    'meta.continuity2017.requiredBlockHeight': -1
  }, {
    $set: {'meta.continuity2017.requiredBlockHeight': blockHeight}
  });
  return result;
};
