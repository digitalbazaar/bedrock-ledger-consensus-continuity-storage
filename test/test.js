/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-ledger-consensus-continuity');
require('bedrock-ledger-consensus-continuity-es-most-recent-participants');
require('bedrock-ledger-storage-mongodb');

require('bedrock-test');
bedrock.start();
