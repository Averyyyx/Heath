declare module 'process' {
  const processShim: {
    browser: boolean;
    env: Record<string, string | undefined>;
    nextTick(callback: (...args: unknown[]) => void, ...args: unknown[]): void;
  };
  export default processShim;
}
