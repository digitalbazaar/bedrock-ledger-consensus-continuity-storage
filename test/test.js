/*!
 * Copyright (c) 2017-2021 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-ledger-consensus-continuity');
require('bedrock-ledger-consensus-continuity-ws-witness-pool');
require('bedrock-ledger-storage-mongodb');
require('bedrock-https-agent');

require('bedrock-test');
bedrock.start();
