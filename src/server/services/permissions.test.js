'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPermissionService } = require('./permissions');

function createService({ member = true, roles = [], defaultRole = null } = {}) {
  return createPermissionService({
    selectServerMember: { get: () => member ? { user_id: 4 } : undefined },
    selectMemberRoles: { all: () => roles },
    selectDefaultRole: { get: () => defaultRole },
    PERMISSIONS: { ADMIN: 1, VIEW_CHANNEL: 1 << 4, SEND_MESSAGES: 1 << 5 }
  });
}

test('permissions combine all assigned roles and include the default role when none are assigned', () => {
  assert.equal(createService({ roles: [{ permissions: 16 }, { permissions: 32 }] }).computeBasePermissions(2, 4), 48);
  assert.equal(createService({ roles: [], defaultRole: { permissions: 16 } }).computeBasePermissions(2, 4), 16);
  assert.equal(createService({ member: false }).computeBasePermissions(2, 4), 0);
});

test('cached roles avoid a second database role lookup', () => {
  let reads = 0;
  const service = createPermissionService({
    selectServerMember: { get: () => ({ user_id: 4 }) },
    selectMemberRoles: { all: () => { reads += 1; return []; } },
    selectDefaultRole: { get: () => null },
    PERMISSIONS: { ADMIN: 1 }
  });
  assert.equal(service.computeBasePermissions(2, 4, [{ permissions: 32 }]), 32);
  assert.equal(reads, 0);
});

test('administrator permission bypasses individual permission checks', () => {
  const service = createService();
  assert.equal(service.hasPermission(1, 1 << 10), true);
  assert.equal(service.hasPermission(16, 16), true);
  assert.equal(service.hasPermission(16, 32), false);
});
