'use strict';

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, twofa_secret, ...rest } = user;
  return rest;
}

module.exports = { sanitizeUser };
