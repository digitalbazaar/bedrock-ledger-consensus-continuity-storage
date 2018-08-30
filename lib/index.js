/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';
const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');

bedrock.events.on('bedrock-ledger-node.ready', async () => {
  brLedgerNode.use('continuity-storage', require('./plugin'));
});
