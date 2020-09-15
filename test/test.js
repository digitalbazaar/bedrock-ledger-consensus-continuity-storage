/*!
 * Copyright (c) 2017-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-ledger-consensus-continuity');
require('bedrock-ledger-consensus-continuity-es-most-recent-participants');
require('bedrock-ledger-storage-mongodb');
require('bedrock-https-agent');

require('bedrock-test');
bedrock.start();
