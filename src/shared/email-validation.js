'use strict';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

module.exports = { isValidEmail };
