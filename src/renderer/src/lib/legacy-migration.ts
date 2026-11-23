const LEGACY_PREFIX = 'nexo.';
const LEGACY_SOUND_KEY = 'nexo.sound-preferences.v2';
const HEARTH_SOUND_KEY = 'hearth.sound-preferences.v1';
const MIGRATED_MARKER = 'hearth.migrated-from-legacy';

export function hasLegacyLocalStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(MIGRATED_MARKER) === '1') return true;
    return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .some((key) => Boolean(key && key.startsWith(LEGACY_PREFIX)));
  } catch {
    return false;
  }
}

export function migrateLegacyLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key));
    const legacyKeys = keys.filter((key) => key.startsWith(LEGACY_PREFIX));
    if (!legacyKeys.length) return;

    storage.setItem(MIGRATED_MARKER, '1');
    const oldSoundPreferences = storage.getItem(LEGACY_SOUND_KEY);
    if (storage.getItem(HEARTH_SOUND_KEY) === null && oldSoundPreferences !== null) {
      storage.setItem(HEARTH_SOUND_KEY, oldSoundPreferences);
    }
    storage.removeItem(LEGACY_SOUND_KEY);

    for (const key of legacyKeys) {
      if (key === LEGACY_SOUND_KEY || key.startsWith('nexo.sound-preferences.')) continue;
      const nextKey = 'hearth.' + key.slice(LEGACY_PREFIX.length);
      if (storage.getItem(nextKey) === null) {
        const value = storage.getItem(key);
        if (value !== null) storage.setItem(nextKey, value);
      }
    }
  } catch {
    // Storage may be disabled by browser or user policy.
  }
}
