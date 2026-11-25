const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

test('application forms use the shared UI controls outside the UI primitives folder', () => {
  const root = path.join(__dirname, '..', 'src', 'renderer', 'src');
  const uiFolder = path.sep + 'components' + path.sep + 'ui' + path.sep;
  const files = walk(root).filter((file) => /\.(tsx|jsx)$/.test(file) && !file.includes(uiFolder));
  const violations = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const matches = source.match(/<(?:input|select|textarea)\b/g) || [];
    if (matches.length) violations.push({ file: path.relative(root, file), count: matches.length });
  }
  assert.deepEqual(violations, [], 'Replace raw form elements with the shared UI primitives.');

  const unstyledButtons = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<button\b([^>]*)>/gs)) {
      if (!/\bclassName\s*=/.test(match[1])) {
        unstyledButtons.push({ file: path.relative(root, file), line: source.slice(0, match.index).split('\n').length });
      }
      if (/\btitle\s*=/.test(match[1])) {
        unstyledButtons.push({ file: path.relative(root, file), line: source.slice(0, match.index).split('\n').length, issue: 'native title tooltip' });
      }
    }
  }
  assert.deepEqual(unstyledButtons, [], 'Buttons must have an explicit Hearth class and use custom tooltips.');
});
