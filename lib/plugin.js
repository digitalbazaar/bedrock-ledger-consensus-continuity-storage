/*!
 * Copyright (c) 2017-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const blocks = require('./blocks');
const events = require('./events');

module.exports = {
  type: 'ledgerStoragePlugin',
  api: {
    expandIndexes: async ({createIndexes, collections}) => {
      await createIndexes([{
        // FIXME: as `consensusProofHash` is to be removed, so may this
        // index be removed
        collection: collections.blockCollection,
        fields: {
          'block.blockHeight': 1,
          'block.consensusProofHash': 1,
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'block.continuity2017.blockHeight.1',
        }
      }, {
        collection: collections.eventCollection,
        fields: {
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.generation': 1,
          'meta.consensus': 1,
          'meta.eventHash': 1,
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.type.1',
          // only merge events have creator and generation
          partialFilterExpression: {'meta.continuity2017.type': 'm'}
        }
      }, {
        // this index is used to find non-consensus events
        collection: collections.eventCollection,
        fields: {
          'meta.consensus': 1,
          'meta.continuity2017.replayDetectedBlockHeight': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.generation': 1,
          'meta.continuity2017.creator': 1,
          'meta.eventHash': 1
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.nonConsensusEvents',
          partialFilterExpression: {
            'meta.consensus': false,
          }
        }
      }, /*{
        // FIXME: remove this index if no longer used, as `aggregateHistory`
        // is no longer used
        collection: collections.eventCollection,
        fields: {
          'meta.eventHash': 1,
          'event.parentHash': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.generation': 1,
        },
        options: {
          sparse: false, unique: true, background: false,
          // this index is getting used based on stats, presumably by
          // aggregateHistory, however index use in $graphLookup is difficult
          // to assess
          name: 'event.continuity2017.aggregateHistory'
        }
      }, */{
        // for validating that peer heads sent by the client during gossip
        // and getting their `localReplayNumber`
        collection: collections.eventCollection,
        fields: {
          'meta.eventHash': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.generation': 1,
          'meta.continuity2017.localReplayNumber': 1
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.peerHeads'
        }
      }, {
        // for cache repair and participant queries
        // FIXME: we don't do either cache repair or participant queries
        // anymore, so we may be able to remove this
        collection: collections.eventCollection,
        fields: {
          'meta.blockHeight': 1,
          'meta.continuity2017.type': 1,
          // creator is used in events.getMergeEventPeers
          'meta.continuity2017.creator': 1,
          // TODO: eventHash was added in support of getMergeEventHashes
          // since that query is only run during cache repair it may
          // be acceptable to allow that query to inspect documents instead
          // of having a larger index. Revisit this after all queries are
          // under unit test to see if eventHash is useful elsewhere.
          'meta.eventHash': 1
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.blockHeight.mergeEvent',
          // only merge events have creator and generation
          // only consensus events have a blockHeight > -1
          partialFilterExpression: {
            'meta.continuity2017.type': 'm',
            'meta.blockHeight': {$gt: -1},
          }
        }
      }, {
        collection: collections.eventCollection,
        fields: {
          'meta.blockHeight': 1,
          'meta.blockOrder': 1,
          'meta.continuity2017.type': 1,
          'event.ledgerConfiguration.sequence': 1,
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.effectiveConfiguration',
          // only consensus events have a blockHeight > -1
          partialFilterExpression: {
            'meta.continuity2017.type': 'c',
            'meta.blockHeight': {$gt: -1},
          }
        }
      }, {
        collection: collections.eventCollection,
        fields: {
          'meta.blockHeight': 1,
          'meta.blockOrder': 1,
          'meta.eventHash': 1
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.consensusHistory',
          // only consensus events have a blockHeight > -1
          partialFilterExpression: {
            'meta.blockHeight': {$gt: -1}
          }
        }
      }, {
        // for getting sorted consensus event summaries for gossip
        collection: collections.eventCollection,
        fields: {
          'meta.blockHeight': 1,
          'meta.continuity2017.gossipOrder': 1,
          'event.basisBlockHeight': 1,
          'meta.continuity2017.type': 1,
          'meta.eventHash': 1
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.gossipConsensusEvents',
          // only consensus events have a blockHeight > -1
          partialFilterExpression: {
            'meta.blockHeight': {$gt: -1}
          }
        }
      }, {
        // for getting sorted non-consensus event summaries for gossip
        collection: collections.eventCollection,
        fields: {
          'meta.blockHeight': 1,
          'meta.continuity2017.localEventNumber': 1,
          // used to cover queries
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.localReplayNumber': 1,
          'meta.continuity2017.generation': 1,
          'event.basisBlockHeight': 1,
          'event.parentHash': 1,
          'meta.eventHash': 1
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.localEventNumber'
        }
      }, {
        collection: collections.eventCollection,
        fields: {
          'meta.continuity2017.type': 1,
          'event.treeHash': 1,
          'meta.continuity2017.creator': 1,
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.replays',
          partialFilterExpression: {
            // only need to consider merge events in this index; it's for
            // finding replays (e.g., forks)
            'meta.continuity2017.type': 'm'
          }
        }
      }, {
        collection: collections.eventCollection,
        fields: {
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.type': 1,
          // reverse order to allow for fast sorting max `localReplayNumber`
          'meta.continuity2017.localReplayNumber': -1
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.localReplayNumber',
          partialFilterExpression: {
            // only need to consider merge events in this index; it's for
            // finding the highest replay number and replay detected
            // blockHeight
            'meta.continuity2017.type': 'm'
          }
        }
      }, {
        // for detecting operation replays
        collection: collections.operationCollection,
        fields: {
          'operation.creator': 1,
          'meta.operationHash': 1
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.operationReplays'
        }
      }]);
      // FIXME: add `events` collection index for detecting config replays
      // BUT ONLY IF the config change feature is not removed:
      // creator+basisBlockHeight+eventHash
    },
    storage: {
      blocks,
      events,
    },
  }
};
