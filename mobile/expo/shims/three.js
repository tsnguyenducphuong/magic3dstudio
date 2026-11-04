/**
 * shims/three.js
 *
 * This file is the ACTUAL module Metro loads when anything imports 'three'.
 * It is wired in via extraNodeModules in metro.config.js, which is resolved
 * before Metro ever reads three/package.json's exports map — so the ESM
 * build (and InternalBytecode.js) are never visited at all.
 *
 * We detect which CJS filename exists at require-time so this works across
 * all Three.js versions:
 * r152+ → three/build/three.cjs (no .js suffix)
 * r151- → three/build/three.cjs.js
 */

'use strict';

let three;

try {
  // three r152+
  three = require('three/build/three.cjs');
} catch (_) {
  // three r151 and below
  three = require('three/build/three.cjs.js');
}

module.exports = three;