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
        // this index is exclusively for events.outstandingRegularEvent
        // FIXME: also used by non-consensus head lookup, so needs an
        // index rename
        collection: collections.eventCollection,
        fields: {
          'meta.consensus': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.generation': 1,
          'meta.continuity2017.creator': 1,
          'meta.eventHash': 1
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.outstandingRegularEvent',
          partialFilterExpression: {
            'meta.consensus': false,
          }
        }
      }, {
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
      }, {
        // for validating that peer heads sent by the client during gossip
        // and getting their `forkNumber`, if any
        collection: collections.eventCollection,
        fields: {
          'meta.eventHash': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.generation': 1,
          'meta.continuity2017.forkNumber': 1
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.peerHeads'
        }
      }, {
        // FIXME: for new history aggregation queries instead of cache repair?
        // for cache repair and participant queries
        collection: collections.eventCollection,
        fields: {
          'meta.blockHeight': 1,
          'meta.continuity2017.type': 1,
          // creator is used in events.getMergeEventPeers
          'meta.continuity2017.creator': 1,
          // TODO: eventHash was added in support of getMergeEventHashes
          // since that query is only run during cache repair it may
          // be acceptable to allow that query to inspect documents instead
          // of having a larger index. Revist this after all queries are
          // under unit test to see if eventHash is useful elsewhere.
          'meta.eventHash': 1,
          // FIXME: include `event.parentHash` to support $graphLookup?
        },
        options: {
          sparse: false, unique: true, background: false,
          name: 'event.continuity2017.blockHeight.mergeEvent',
          // only merge events have creator and generation
          // only consensus events have a blockHeight
          partialFilterExpression: {
            'meta.continuity2017.type': 'm',
            'meta.blockHeight': {$exists: true},
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
          // only consensus events have a blockHeight
          partialFilterExpression: {
            'meta.continuity2017.type': 'c',
            'meta.blockHeight': {$exists: true},
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
          partialFilterExpression: {
            'meta.blockHeight': {$exists: true}
          }
        }
      }, {
        // for gossipping events that have reached consensus
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
          partialFilterExpression: {
            'meta.blockHeight': {$exists: true}
          }
        }
      }, {
        // used for gossipping non-consensus events in `localEventNumber` order
        collection: collections.eventCollection,
        fields: {
          'meta.continuity2017.localEventNumber': 1,
          'meta.blockHeight': 1,
          // used to cover queries
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.forkNumber': 1,
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
          name: 'event.continuity2017.forkers',
          partialFilterExpression: {
            // only need to consider merge events in this index; it's for
            // finding forks
            'meta.continuity2017.type': 'm'
          }
        }
      }, {
        collection: collections.eventCollection,
        fields: {
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.forkNumber': 1,
          'meta.continuity2017.forkDetectedBlockHeight': 1
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.forkNumber',
          partialFilterExpression: {
            // only need to consider merge events in this index; it's for
            // finding the highest fork number and fork detected blockHeight
            'meta.continuity2017.type': 'm'
          }
        }
      }]);
    },
    storage: {
      blocks,
      events,
    },
  }
};
