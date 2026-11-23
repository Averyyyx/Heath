# Releasing

Hearth uses `.github/workflows/ci.yml` for validation and `.github/workflows/release.yml` for Windows Alpha releases.

## Before release

1. Update the version in the root and renderer `package.json` files and both lock files.
2. Add the user-visible changes to the top of `CHANGELOG.md`.
3. Run `npm ci` and `npm ci --prefix src/renderer`.
4. Require green CI, including tests, TypeScript, the application build, Windows installer packaging, packaged-file checks, E2E, inventory comparison, and visual comparison.
5. Confirm that the installer application identifier remains unchanged so existing installations can update in place.

## Publish

The Release workflow supports a manual run, a pushed `v*` tag, and a successful CI run on `main` whose commit message contains `[release]`.

It builds the Windows x64 NSIS installer and the adjacent SHA-256 file. For version 0.0.9 the expected assets are:

- `Hearth-0.0.9-Setup.exe`
- `Hearth-0.0.9-Setup.exe.sha256`

Both files are published as a GitHub prerelease. The updater reads prerelease assets from the repository configured in `src/shared/brand.js`.

## Что должен сделать владелец репозитория

1. В GitHub открыть Settings → General → Repository name и переименовать существующий репозиторий в `Hearth`. Нужно переименовать именно существующий репозиторий, чтобы GitHub сохранил перенаправление старых адресов. Не создавать новый репозиторий со старым именем.
2. В локальной копии выполнить в PowerShell: `git remote set-url origin https://github.com/Averyyyx/Hearth.git`.
3. Переименовать локальную папку проекта в `hearth` и заново открыть её в VS Code.
4. После всех зелёных проверок слить `chore/0.0.9-restructure` в `main`, дождаться зелёного CI и сделать отдельный коммит с `[release]` в сообщении.
5. После публикации проверить, что в GitHub prerelease есть оба файла: установщик и checksum с указанными выше именами.
