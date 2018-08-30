/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const events = require('./events');

// TODO: all consensus queries that interact directly with storage collections
// should be added here, they will extend the storage classes.

module.exports = {
  type: 'ledgerStoragePlugin',
  api: {
    expandIndexes: async ({createIndexes, collections}) => {
      await createIndexes([{
        collection: collections.eventCollection,
        fields: {
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
          'meta.continuity2017.generation': 1,
          'meta.eventHash': 1,
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.continuity2017.type.1'
        }
      }, {
        collection: collections.eventCollection,
        fields: {
          'meta.consensus': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.consensus.continuity2017.1'
        }
      }, {
        // for cache repair and participant queries
        collection: collections.eventCollection,
        fields: {
          'meta.blockHeight': 1,
          'meta.continuity2017.type': 1,
          'meta.continuity2017.creator': 1,
        },
        options: {
          sparse: false, unique: false, background: false,
          name: 'event.blockHeight.continuity2017.1'
        }
      }]);
    },
    storage: {
      events,
    },
  }
};
