'use strict';
// main.js and the renderer files are not loaded by the unit tests (they need Electron), so a syntax
// slip there would otherwise only show up as Electron's modal "error during load" box at launch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('./helpers');

const skip = (f) => /art(-\w+)?\.js$|food\.js$|parachute\.js$/.test(f);   // huge generated data files
test('every app source file parses', () => {
  for (const dir of ['src/main', 'src/shared', 'src/renderer', 'src/settings']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(n => n.endsWith('.js') && !skip(n))) {
      assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(ROOT, dir, f)], { stdio: 'pipe' }), `${dir}/${f} has a syntax error`);
    }
  }
});
