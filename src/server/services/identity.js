'use strict';

const AVATAR_PALETTE = ['#D97757', '#B66F83', '#788CB8', '#6F9B86', '#B18A55', '#897CB4', '#5F9EAA', '#9A806D', '#7E9670'];

function createIdentityService({ selectUserByUsername, now = Date.now, random = Math.random }) {
  function normalizeHandle(value = '') {
    return value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
  }

  function defaultAvatarColor(handle = '') {
    let hash = 0;
    for (const character of String(handle).toLowerCase()) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  }

  function randomDiscriminator() {
    return String(Math.floor(1000 + random() * 9000));
  }

  function generateUniqueHandle(seed) {
    const base = normalizeHandle(seed) || 'user' + now();
    let attempt = 0;
    let candidate = base;
    while (selectUserByUsername.get(candidate)) {
      attempt += 1;
      candidate = base + attempt;
    }
    return candidate;
  }

  function generateHandleFromEmail(email) {
    const localPart = email.includes('@') ? email.split('@')[0] : email;
    return generateUniqueHandle(localPart);
  }

  return {
    normalizeHandle,
    defaultAvatarColor,
    randomDiscriminator,
    generateUniqueHandle,
    generateHandleFromEmail
  };
}

module.exports = { createIdentityService };
