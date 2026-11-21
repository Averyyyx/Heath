'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const stylesheet = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'styles.css'), 'utf8');

test('Nexo UI text never uses a font size below 12px', () => {
  const declarations = [
    ...stylesheet.matchAll(/\bfont-size\s*:\s*(\d+(?:\.\d+)?)px/gi),
    ...stylesheet.matchAll(/\bfont\s*:\s*[^;{}]*?\b(\d+(?:\.\d+)?)px/gi)
  ];
  const undersized = declarations
    .map((match) => Number(match[1]))
    .filter((size) => size < 12);
  assert.deepEqual(undersized, [], 'All visible UI text must be at least 12px');
});

test('removed legacy navigation classes are not reintroduced', () => {
  for (const legacyClass of [
    'nexo-server-rail',
    'sidebar-collapse-toggle',
    'home-overview-grid',
    'home-note',
    'dock-call-status',
    'workspace-nav'
  ]) {
    assert.equal(stylesheet.includes('.' + legacyClass), false, legacyClass + ' must stay removed');
  }
});

test('hidden tab panels use one intentional hidden-state rule', () => {
  const ruleCount = stylesheet.split('.nexo-tab-panel[hidden]').length - 1;
  assert.equal(ruleCount, 1);
});
