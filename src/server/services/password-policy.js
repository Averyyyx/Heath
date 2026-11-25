'use strict';

const zxcvbn = require('zxcvbn');

function createPasswordPolicy({ minimumScore = 3, scorer = zxcvbn } = {}) {
  function validatePasswordStrength(password, identifier = '') {
    const analysis = scorer(password, identifier ? [identifier] : undefined);
    if (analysis.score < minimumScore) {
      const error = new Error('Password too weak. Use longer passphrases with symbols.');
      error.statusCode = 400;
      throw error;
    }
  }

  return { validatePasswordStrength };
}

const { validatePasswordStrength } = createPasswordPolicy();

module.exports = { createPasswordPolicy, validatePasswordStrength };
