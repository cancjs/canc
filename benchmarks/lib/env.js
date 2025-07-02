'use strict';

const os = require('os');

/**
 * Captures node version + CPU info for result provenance ("node version
 * + CPU captured"). Kept as plain fields, not a class — results get JSON.stringify'd.
 */
function captureEnv() {
 const cpus = os.cpus() || [];
 const first = cpus[0] || {};
 return {
 node: process.version,
 platform: process.platform,
 arch: process.arch,
 cpuModel: first.model || 'unknown',
 cpuCount: cpus.length,
 timestamp: new Date().toISOString(),
 };
}

module.exports = { captureEnv };
