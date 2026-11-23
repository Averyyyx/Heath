export const BRAND = {
  name: 'Hearth',
  slug: 'hearth',
  cssPrefix: 'hr',
  protocol: 'hearth',
  envPrefix: 'HEARTH_',
  repo: { owner: 'Averyyyx', name: 'Hearth' },
  premium: 'Hearth Plus',
  userAgent: 'Hearth-Desktop'
} as const;

const LEGACY_STORAGE_PREFIX = 'nexo.';
const CURRENT_STORAGE_PREFIX = 'hearth.';

export function migrateLegacyLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key));
    for (const key of keys) {
      if (!key.startsWith(LEGACY_STORAGE_PREFIX) || key.startsWith('nexo.sound-preferences.')) continue;
      const nextKey = CURRENT_STORAGE_PREFIX + key.slice(LEGACY_STORAGE_PREFIX.length);
      if (window.localStorage.getItem(nextKey) === null) {
        const value = window.localStorage.getItem(key);
        if (value !== null) window.localStorage.setItem(nextKey, value);
      }
    }
  } catch {
    // Storage may be disabled by the browser or user policy.
  }
}
