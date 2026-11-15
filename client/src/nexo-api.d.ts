// API, которое preload.js Electron пробрасывает в окно через contextBridge.
// В обычном браузере window.nexoAPI отсутствует (undefined).
export {};

declare global {
  interface Window {
    nexoAPI?: {
      setNotificationCount: (count: number) => void;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      getAppVersion: () => Promise<string>;
      onNotificationUpdate: (callback: (...args: unknown[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
