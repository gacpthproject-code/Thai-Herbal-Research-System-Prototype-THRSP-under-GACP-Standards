'use strict';

const { APPEAL_SETUP_KEY } = require('./appeal-setup');
const { CERTIFICATE_NUMBERING_KEYS } = require('../services/certificate-numbering-settings');

const SCRIPT_SET_CONFIG_KEYS = new Set([APPEAL_SETUP_KEY, ...CERTIFICATE_NUMBERING_KEYS]);

module.exports = { SCRIPT_SET_CONFIG_KEYS };
