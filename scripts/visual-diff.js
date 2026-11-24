'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const BASELINE_DIR = path.resolve('artifacts/baseline/shots');
const CURRENT_DIR = path.resolve('artifacts/current/shots');
const DIFF_DIR = path.resolve('artifacts/diff');
const MAX_CHANGED_PERCENT = 0.5;
const PIXEL_THRESHOLD = 0.1;

// Ignore only content that is expected to differ from the historical 0.0.8
// reference: Hearth branding/version text, randomized E2E account names, the
// new What's New entry point, and the synthetic camera video frame.
const IGNORED_REGIONS = {
  'group-call-three-participants-light-1440x900.png': [
    { x: 0, y: 0, width: 180, height: 40 },
    { x: 100, y: 40, width: 450, height: 40 },
    { x: 275, y: 80, width: 450, height: 50 },
    { x: 780, y: 220, width: 260, height: 55 },
    { x: 15, y: 300, width: 245, height: 110 },
    { x: 20, y: 430, width: 240, height: 55 },
    { x: 0, y: 770, width: 260, height: 55 },
    { x: 0, y: 825, width: 260, height: 55 }
  ],
  'incoming-call-dark-1440x900.png': [
    { x: 0, y: 0, width: 180, height: 40 },
    { x: 100, y: 40, width: 240, height: 40 },
    { x: 275, y: 80, width: 360, height: 50 },
    { x: 15, y: 300, width: 245, height: 110 },
    { x: 610, y: 435, width: 260, height: 55 },
    { x: 0, y: 825, width: 260, height: 55 }
  ],
  'settings-updates-dark-1440x900.png': [
    { x: 0, y: 0, width: 200, height: 40 },
    { x: 480, y: 35, width: 260, height: 35 },
    { x: 480, y: 80, width: 820, height: 330 },
    { x: 155, y: 450, width: 240, height: 45 }
  ],
  'settings-updates-light-1440x900.png': [
    { x: 0, y: 0, width: 200, height: 40 },
    { x: 480, y: 35, width: 260, height: 35 },
    { x: 480, y: 80, width: 820, height: 330 },
    { x: 155, y: 450, width: 240, height: 45 }
  ],
  'voice-channel-camera-dark-1440x900.png': [
    { x: 620, y: 285, width: 465, height: 360 },
    { x: 0, y: 0, width: 180, height: 40 },
    { x: 100, y: 40, width: 240, height: 40 },
    { x: 275, y: 80, width: 450, height: 50 },
    { x: 15, y: 300, width: 245, height: 110 },
    { x: 0, y: 825, width: 260, height: 55 }
  ]
};

function applyComparisonMasks(baseline, current, name) {
  const regions = IGNORED_REGIONS[name] || [];
  for (const region of regions) {
    const left = Math.max(0, Math.floor(region.x));
    const top = Math.max(0, Math.floor(region.y));
    const right = Math.min(baseline.width, Math.ceil(region.x + region.width));
    const bottom = Math.min(baseline.height, Math.ceil(region.y + region.height));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const offset = (y * baseline.width + x) * 4;
        for (const image of [baseline, current]) {
          image.data[offset] = 0;
          image.data[offset + 1] = 0;
          image.data[offset + 2] = 0;
          image.data[offset + 3] = 255;
        }
      }
    }
  }
}

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
    applyComparisonMasks(baseline, current, name);
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
