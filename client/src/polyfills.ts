import processShim from 'process';

const browserGlobal = globalThis as typeof globalThis & { process?: typeof processShim };
browserGlobal.process ??= processShim;
