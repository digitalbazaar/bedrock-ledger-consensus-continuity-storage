/*!
 * Copyright (c) 2017-2021 Digital Bazaar, Inc. All rights reserved.
 */
const {config} = require('bedrock');
const path = require('path');

config.mocha.tests.push(path.join(__dirname, 'mocha'));

// MongoDB
// using abbreviation to avoid index sizes exceeding 127 bytes
config.mongodb.name = 'bedrock_ledger_c_c_storage_test';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];

// set this to false to ignore SSL errors in tests.
config['https-agent'].rejectUnauthorized = false;
