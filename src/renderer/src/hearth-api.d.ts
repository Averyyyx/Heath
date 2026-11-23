// API, которое preload.js Electron пробрасывает в окно через contextBridge.
// В обычном браузере window.hearthAPI отсутствует (undefined).
export {};

declare global {
  interface Window {
    hearthAPI?: {
      setNotificationCount: (count: number) => void;
      showNotification: (payload: { title: string; body: string; deepLink: string }) => Promise<boolean>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      getAppVersion: () => Promise<string>;
      getReleaseNotes: (version: string) => Promise<string>;
      setWindowTheme: (theme: 'light' | 'dark' | 'system') => void;
      checkForUpdates: () => Promise<{ status: string; version?: string; message: string; releaseNotes?: string }>;
      onUpdateStatus: (callback: (payload: { status: string; version?: string; message?: string; percent?: number; releaseNotes?: string }) => void) => (() => void) | void;
      openLogs: () => void;
      getUpdatePreferences: () => Promise<{ autoDownload: boolean }>;
      setUpdatePreferences: (preferences: { autoDownload: boolean }) => void;
      onNotificationUpdate: (callback: (...args: unknown[]) => void) => void;
      removeAllListeners: (channel: string) => void;
      onDeepLink: (callback: (payload: { type: 'dm'; conversationId: number; messageId?: number } | { type: 'channel'; serverId: number; channelId: number; messageId?: number }) => void) => () => void;
    };
  }
}
