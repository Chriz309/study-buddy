'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isDevMode, createEconomy } = require('../src/shared/devmode');

test('isDevMode: dev build flag, or unpackaged run with the env var; never a packaged build via env', () => {
  assert.equal(isDevMode({ devBuildFlag: true, isPackaged: true, env: {} }), true);
  assert.equal(isDevMode({ devBuildFlag: false, isPackaged: false, env: { STUDYBUDDY_DEV: '1' } }), true);
  assert.equal(isDevMode({ devBuildFlag: false, isPackaged: true, env: { STUDYBUDDY_DEV: '1' } }), false, 'public packaged build ignores the env var');
  assert.equal(isDevMode({ devBuildFlag: undefined, isPackaged: true, env: { STUDYBUDDY_DEV: '1' } }), false);
  assert.equal(isDevMode({ devBuildFlag: 'true', isPackaged: true, env: {} }), false, 'only boolean true counts');
  assert.equal(isDevMode({ isPackaged: false, env: {} }), false);
  assert.equal(isDevMode({}), false);
  assert.equal(isDevMode(), false);
});

test('economy: public builds spend normally, dev builds never run out', () => {
  const pub = createEconomy(false);
  assert.equal(pub.infinite, false);
  assert.equal(pub.canAfford(100, 300), false);
  assert.equal(pub.canAfford(300, 300), true);
  assert.equal(pub.after(500, 300), 200);
  assert.equal(pub.display(1234.9), '1234');
  const dev = createEconomy(true);
  assert.equal(dev.infinite, true);
  assert.equal(dev.canAfford(0, 1e12), true);
  assert.equal(dev.after(5, 1e12), 5, 'spending does not reduce them');
  assert.equal(dev.display(5), '∞');
  for (const bad of [undefined, null, 1, 'true', {}]) assert.equal(createEconomy(bad).infinite, false, 'anything but boolean true is finite');
});

test('public build has no path to infinite Sparks: no dev flag in package.json or the public builder config', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.studyBuddyDevBuild, undefined);
  assert.ok(!/studyBuddyDevBuild/.test(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')));
  assert.ok(/studyBuddyDevBuild:\s*true/.test(fs.readFileSync(path.join(root, 'electron-builder.dev.yml'), 'utf8')));
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  assert.ok(/createEconomy\(DEV\)/.test(main), 'economy is built from DEV only');
  assert.ok(!/createEconomy\((?!DEV\))/.test(main), 'no other way to build an infinite economy');
  assert.ok(!/infiniteSparks\s*[:=]\s*(true|DEV_TOOLS)/.test(main));
  const cat = fs.readFileSync(path.join(root, 'src', 'shared', 'catalog.js'), 'utf8');
  assert.ok(/DEV_TOOLS = false/.test(cat));
});
