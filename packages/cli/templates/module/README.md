# __DISPLAY__

A Forge module made with `forge module create`.

```bash
npm install
npm test
forge module dev .     # registers this folder, rebuilds on change, reloads it in Forge
```

- `src/server.ts` runs inside Forge's server: routes, actions, jobs and events, through the `ctx` Forge passes in.
- `src/view.tsx` is the page in Forge's sidebar. Forge's UnoCSS does not see this bundle, so style with inline
  `style` and the theme tokens (`var(--card)`, `var(--ink-2)`…) plus `@forge-dev/ui` components.
- Declare in `forge-module.json` every permission the server half needs (`network`, `fs:read`, `fs:write`, `shell`, `pty`).
  Forge refuses calls outside them.
- `npm run build`, then `forge module install .` (or `npm publish` and `forge module install <name>`).
