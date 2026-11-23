# Architecture

Hearth is a desktop communication application. The 0.0.9 codebase keeps the existing Electron, React, TypeScript, Node.js, Express, Socket.IO, and SQLite stack.

## Runtime layers

- **Electron main** — `src/main/main.js` owns the desktop lifecycle, windows, tray, updater, deep links, and the local server process.
- **Preload** — `src/preload/index.js` exposes the limited `window.hearthAPI` bridge through Electron's context bridge. The splash window uses `src/preload/splash.js`.
- **Renderer** — `src/renderer/src` contains the React application, UI components, feature components, shared client utilities, and CSS layers.
- **Server** — `src/server/index.js` starts Express and Socket.IO. Database schema and queries live in `src/server/db`; authentication, session middleware, services, and utilities are split into their respective directories.
- **Shared code** — `src/shared` contains brand configuration and validation shared by desktop and server code.

## Data

The desktop app stores its profile under the operating system's Hearth application-data directory. SQLite data is stored in `hearth.db`; uploaded files and generated assets are kept under the configured data directory.

The first Hearth launch copies durable data from the previous profile directory. Chromium cache directories are skipped, while local/session storage and secrets are retained. The previous profile directory is intentionally preserved as a rollback copy.

## Compatibility

- The Electron application ID remains stable so existing Windows installations can update in place.
- The application uses the `hearth://` deep-link protocol.
- Existing HTTP routes and Socket.IO event names are preserved during the structural refactor.
