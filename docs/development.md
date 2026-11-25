# Development

## Requirements

- Windows 10/11 for the desktop packaging workflow
- Node.js 22
- npm

## Install

From the repository root:

```sh
npm ci
npm ci --prefix src/renderer
```

## Run

Start the local server:

```sh
npm run dev
```

Start the Electron desktop app:

```sh
npm start
```

Run the renderer dev server separately when working on the UI:

```sh
npm run dev:client
```

## Build and checks

```sh
npm test
npm run build:app
npm run electron:build
```

The CI workflow checks the baseline API/event inventory, runs the Node test suite, type-checks the renderer, builds the app, and captures UI screenshots with Playwright.

## Developer account

See [Developer test account](dev-account.md) for local-only test account setup and safety rules.
