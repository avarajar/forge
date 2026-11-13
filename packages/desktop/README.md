# @forge-dev/desktop

Forge as a macOS app: an Electron shell that runs the Forge server inside its main process and shows the console in a window. For personal use for now: signed ad hoc, not notarized, no auto-update.

```bash
pnpm --filter @forge-dev/desktop app:install   # build Forge.app and copy it to ~/Applications
pnpm --filter @forge-dev/desktop app           # build only: out/Forge-darwin-<arch>/Forge.app
pnpm --filter @forge-dev/desktop start         # run from the checkout (needs pnpm build first)
FORGE_PORT=3417 pnpm --filter @forge-dev/desktop start   # next to a Forge already on 3000
pnpm --filter @forge-dev/desktop icon          # re-render build/icon.icns from build/icon.svg
```

Rebuild with `app:install` after pulling changes; the app does not update itself.

## Download instead of building

Every version `release.yml` publishes to npm also gets a GitHub Release (`v<version>`) with `Forge-<version>-mac-arm64.zip`, built and started on a macOS runner. It is signed ad hoc only, so a downloaded copy is quarantined: unzip it, move `Forge.app` to Applications and run once

```bash
xattr -dr com.apple.quarantine /Applications/Forge.app
```

Changes only under `packages/desktop` do not publish a version. To rebuild the app for the current version, run the Release workflow by hand (Actions → Release → Run workflow); it replaces the zip on that version's Release.

## Packaging

`scripts/pack.mjs` runs `pnpm build`, bundles `src/main.ts` with esbuild (core inlined, `electron` and `node-pty` external), copies the console, the bundled modules' manifests and node-pty's `lib` plus the prebuild for this Mac's architecture, packages it with `@electron/packager` (no asar) and signs it ad hoc with `codesign --sign -`. The ad hoc signature runs on the Mac that built it; another Mac needs a Developer ID signature and notarization.

The app does not install CW: it uses the one in `~/.cw` (or on the login shell's PATH).

## What it does

- **Server in process.** `createForgeServer` runs in Electron's main process (Node 24 in Electron 45). `node:sqlite` and `node-pty` (N-API) load without a rebuild.
- **PATH from the login shell.** A Finder-launched app only gets launchd's PATH, so `shell-path.ts` asks `$SHELL -ilc` for the real one before CW, claude, gh, kioku or lf are looked up.
- **Reuses a running Forge.** If `npx forge-cw` or `cw forge` already answers on the port, the window shows that one. If something else holds the port, it listens on a free one (the origin guard only checks for loopback).
- **Window.** Closing it keeps Forge and its terminals alive. Quit (⌘Q) stops them. Links that leave Forge (GitHub, Linear, kioku web) open in the browser. The menu leaves ⌘W, ⌘K, ⌘J and ⌘L to the console. Close Window is ⌘⇧W.
- **Menu bar item.** Polls `/api/cw/session-states` every 3 s and shows how many sessions are waiting, asking for permission or failed, both in the menu bar and as the Dock badge.

Server startup is `startForge` in core (`packages/core/src/start.ts`), shared with the npm package. The app ignores `FORGE_DB_URL`: team mode belongs to the npm package.

## Not done yet

- Developer ID signing, notarization and auto-update (needs an Apple Developer account), an x64 or universal build, a `.dmg`.
- Bundling CW the way the npm package does.
- Native notifications instead of the browser ones, launch at login, global shortcut, remembered window size.
- Linux (AppImage/.deb) from the same script.
