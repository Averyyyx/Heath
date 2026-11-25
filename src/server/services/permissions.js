'use strict';

function createPermissionService({ selectServerMember, selectMemberRoles, selectDefaultRole, PERMISSIONS }) {
  function computeBasePermissions(serverId, userId, cachedRoles = null) {
    const membership = selectServerMember.get(serverId, userId);
    if (!membership) return 0;
    let permissions = 0;
    const roles = cachedRoles ?? selectMemberRoles.all(serverId, userId);
    if (roles.length === 0) {
      const defaultRole = selectDefaultRole.get(serverId);
      if (defaultRole) permissions |= defaultRole.permissions;
    } else {
      roles.forEach((role) => { permissions |= role.permissions; });
    }
    return permissions;
  }

  function hasPermission(permissions, required) {
    if ((permissions & PERMISSIONS.ADMIN) === PERMISSIONS.ADMIN) return true;
    return (permissions & required) === required;
  }

  return { computeBasePermissions, hasPermission };
}

module.exports = { createPermissionService };
