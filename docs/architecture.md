# Architecture

Hearth is a Windows desktop messenger for developers. The application keeps its existing Electron, React, TypeScript, Vite, Node.js, Express, Socket.IO, SQLite, and WebRTC stack.

## Runtime

- **Electron main process** — `src/main/index.js` owns the application lifecycle, native windows, system tray, IPC, deep links, server process, and updater.
- **Preload** — `src/preload/preload.js` exposes the restricted `window.hearthAPI` bridge. The splash window uses `src/preload/splash-preload.js`.
- **Renderer** — `src/renderer/src` contains the React application, feature components, shared client utilities, and CSS layers.
- **Embedded server** — `src/server/index.js` starts Express and Socket.IO on `127.0.0.1:4000`. It handles HTTP API requests, account data, message delivery, presence, and call signalling.
- **WebRTC** — media is exchanged between call participants. Socket.IO carries signalling; the local server is not a central media relay.
- **Shared code** — `src/shared` contains application identity, brand configuration, and validation shared by the desktop process and server.

## Project layout

- `docs` — architecture, development, release, test-account, and engineering notes.
- `resources` — Hearth branding, Windows application icons, and installer assets.
- `scripts` — icon generation, public asset preparation, source inventory, E2E, and visual-difference tools.
- `src/main` — Electron desktop lifecycle and supporting modules.
- `src/preload` — isolated bridges between Electron and the renderer.
- `src/server` — embedded HTTP and real-time server, database, middleware, routes, services, and socket handlers.
- `src/renderer` — the Vite and React client, with its own package and lock file.
- `src/shared` — values and validation used by the desktop and server.
- `tests` — integration and cross-module tests.

The root package remains the desktop/server dependency root so Electron Builder and native modules use one root `node_modules`. The renderer has a separate package and lock file because Vite builds it independently. npm workspaces are not used.

## Data

The desktop profile is stored under `%APPDATA%\\Hearth`. The database is `%APPDATA%\\Hearth\\data\\hearth.db`; uploaded files and temporary data are kept under the same `data` directory. Desktop secrets are stored in `%APPDATA%\\Hearth\\secrets.json`, and application logs are kept in the profile's `logs` directory.

On the first launch after the rename, the app copies the previous profile into the Hearth profile before starting the server. It retains settings, Local Storage, Session Storage, cookies, secrets, the SQLite database, and uploaded files. Only Chromium cache directories are excluded. The copied database and developer account are updated, old HTTP sessions are cleared, and the original profile is preserved as a rollback copy.

## Updates

The desktop updater checks GitHub Releases, downloads the Windows setup executable and its SHA-256 checksum, verifies the installer, then starts the Windows installer quietly. The installer identifier remains stable so an update can replace an existing installation.

## Boundaries and limitations

Each desktop installation runs its own local server and stores its own SQLite database. There is no shared central Hearth server. Group calls currently use a peer-to-peer mesh and are intended for a small group of participants.
