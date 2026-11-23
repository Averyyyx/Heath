'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const legacyTokens = ['ne' + 'xo', 'ven' + 'cord', 'vem' + 'cord'];
const patterns = legacyTokens.map((token) => new RegExp(token, 'i'));
const allowedFiles = new Set([
  'package-lock.json',
  'src/renderer/package-lock.json',
  'src/main/lib/user-data-migration.js',
  'src/main/lib/user-data-migration.test.js',
  'src/renderer/src/lib/legacy-migration.ts',
  'src/server/db/migrations.js',
  'src/server/db/migrations.test.js',
  'src/renderer/src/content/whats-new.ts',
  'CHANGELOG.md'
]);
const appId = 'com.' + legacyTokens[0] + '.app';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const violations = [];

for (const file of files) {
  if (patterns.some((pattern) => pattern.test(file))) {
    violations.push(file + ': legacy product name in filename');
    continue;
  }
  if (allowedFiles.has(file)) continue;
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if ((file === 'src/main/main.js' || file === 'electron-builder.yml') && line.includes(appId)) return;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        violations.push(file + ':' + (index + 1) + ': ' + line.trim());
        break;
      }
    }
  });
}

if (violations.length) {
  console.error('Legacy brand references found outside approved migration and history files:');
  for (const violation of violations) console.error(' - ' + violation);
  process.exitCode = 1;
} else {
  console.log('Brand scan passed. Legacy references are limited to documented compatibility files.');
}
