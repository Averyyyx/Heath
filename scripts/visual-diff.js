'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const BASELINE_DIR = path.resolve('artifacts/baseline/shots');
const CURRENT_DIR = path.resolve('artifacts/current/shots');
const DIFF_DIR = path.resolve('artifacts/diff');
const MAX_CHANGED_PERCENT = 0.5;
const PIXEL_THRESHOLD = 0.1;

async function main() {
  const pixelmatch = (await import('pixelmatch')).default;
  if (!fs.existsSync(BASELINE_DIR) || !fs.existsSync(CURRENT_DIR)) {
    throw new Error('Both artifacts/baseline/shots and artifacts/current/shots must exist.');
  }
  const names = fs.readdirSync(BASELINE_DIR).filter((name) => name.toLowerCase().endsWith('.png')).sort();
  if (!names.length) throw new Error('No baseline PNG screenshots were found.');
  fs.mkdirSync(DIFF_DIR, { recursive: true });
  const rows = [];
  let failed = false;

  for (const name of names) {
    const baselinePath = path.join(BASELINE_DIR, name);
    const currentPath = path.join(CURRENT_DIR, name);
    if (!fs.existsSync(currentPath)) {
      rows.push({ file: name, percent: 'missing', result: 'FAIL' });
      failed = true;
      continue;
    }
    const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    const current = PNG.sync.read(fs.readFileSync(currentPath));
    if (baseline.width !== current.width || baseline.height !== current.height) {
      rows.push({ file: name, percent: 'dimensions differ', result: 'FAIL' });
      failed = true;
      continue;
    }
    const diff = new PNG({ width: baseline.width, height: baseline.height });
    const changed = pixelmatch(baseline.data, current.data, diff.data, baseline.width, baseline.height, {
      threshold: PIXEL_THRESHOLD
    });
    const total = baseline.width * baseline.height;
    const percent = (changed / total) * 100;
    const diffBuffer = PNG.sync.write(diff);
    fs.writeFileSync(path.join(DIFF_DIR, name), diffBuffer);
    const pass = percent <= MAX_CHANGED_PERCENT;
    rows.push({ file: name, percent: percent.toFixed(3) + '%', result: pass ? 'PASS' : 'FAIL' });
    if (!pass) failed = true;
  }

  console.table(rows);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
