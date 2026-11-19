const test = require('node:test');
const assert = require('node:assert/strict');
const { compareReleaseVersions } = require('./version');

test('orders alpha releases', () => {
  assert.equal(compareReleaseVersions('0.0.3-alpha', '0.0.4-alpha'), -1);
});
test('compares numeric version segments, not lexicographically', () => {
  assert.equal(compareReleaseVersions('0.0.10', '0.0.9'), 1);
});
test('stable beats prerelease of the same version', () => {
  assert.equal(compareReleaseVersions('0.0.4', '0.0.4-alpha'), 1);
});
test('identical versions compare equally', () => {
  assert.equal(compareReleaseVersions('v1.2.3-alpha.2', '1.2.3-alpha.2'), 0);
});
