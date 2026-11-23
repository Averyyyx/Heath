'use strict';

function createUpdaterPreferences({ app, fs, path }) {
  function updatePreferencesPath() {
    return path.join(app.getPath('userData'), 'update-preferences.json');
  }

  function getUpdatePreferences() {
    try {
      return { autoDownload: JSON.parse(fs.readFileSync(updatePreferencesPath(), 'utf8')).autoDownload !== false };
    } catch {
      return { autoDownload: true };
    }
  }

  function setUpdatePreferences(value = {}) {
    const preferences = { autoDownload: value.autoDownload !== false };
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(updatePreferencesPath(), JSON.stringify(preferences, null, 2), 'utf8');
    return preferences;
  }

  return { getUpdatePreferences, setUpdatePreferences };
}

module.exports = { createUpdaterPreferences };
