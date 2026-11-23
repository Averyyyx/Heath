const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('splash window is compact, frameless, and draggable without blocking its button', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'splash.html'), 'utf8');
  const windowBlock = main.match(/function createSplashWindow\(\)[\s\S]*?function createWindow\(/)?.[0] || '';
  assert.match(windowBlock, /width:\s*440/);
  assert.match(windowBlock, /height:\s*520/);
  assert.match(windowBlock, /resizable:\s*false/);
  assert.match(windowBlock, /movable:\s*true/);
  assert.match(windowBlock, /frame:\s*false/);
  assert.match(html, /-webkit-app-region:\s*drag/);
  assert.match(html, /\.card\s*\{[^}]*-webkit-app-region:\s*drag/s);
  assert.match(html, /button\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
});
