# Releasing

Hearth uses the GitHub Actions workflow `.github/workflows/alpha-release.yml` for Windows Alpha releases.

## Before release

1. Update the root and renderer package versions together.
2. Update `CHANGELOG.md` with user-visible changes.
3. Run `npm test`, `npm run build:app`, and the Windows CI checks.
4. Confirm the Electron application ID remains `com.nexo.app`.

## Publish

The release workflow can be started manually, by pushing a version tag matching `v*`, or after a successful CI run on `main` whose release commit message starts with `[release]`.

The workflow builds the Windows NSIS installer, calculates a SHA-256 checksum, uploads both as workflow artifacts, and publishes a GitHub prerelease with the installer, checksum, update metadata, and blockmap.

The updater reads prerelease assets from the GitHub repository configured in `src/shared/brand.js`. The repository must be named `Hearth` before the updater can retrieve Hearth releases.
