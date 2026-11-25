const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('splash window is compact, frameless, and draggable without blocking its button', () => {
  const splash = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'windows', 'splash-window.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'splash.html'), 'utf8');
  assert.match(splash, /width:\s*440/);
  assert.match(splash, /height:\s*520/);
  assert.match(splash, /resizable:\s*false/);
  assert.match(splash, /movable:\s*true/);
  assert.match(splash, /frame:\s*false/);
  assert.match(html, /-webkit-app-region:\s*drag/);
  assert.match(html, /\.card\s*\{[^}]*-webkit-app-region:\s*drag/s);
  assert.match(html, /button\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
});
