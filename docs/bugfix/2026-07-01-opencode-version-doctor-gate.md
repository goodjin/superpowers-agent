# OpenCode Version Doctor Gate

## Problem

Published package validation showed that `bunx superpowers-controller install` can write the plugin config successfully, but the host `opencode` binary may still be too old to load the plugin's dynamic agents.

On this machine:

- `opencode --version`: `1.3.10`
- `bunx superpowers-controller doctor`: passed before this fix
- `opencode agent list`: loaded config after a local config cleanup, but did not list `super-agent`
- `tools/opencode-1.16.2/node_modules/.bin/opencode agent list`: listed `super-agent` and `sp-*` agents from the published npm package

## Decision

Require OpenCode `>=1.16.0` in `doctor`. The e2e harness and release validation already target OpenCode 1.16.2, so this is the minimum verified runtime line.

The one-click installer may continue after a missing `opencode` executable because users can install OpenCode after writing config, but it should fail on an installed OpenCode that is too old.

## Validation

- `bun test test/install.test.ts test/package-entrypoints.test.ts`
- `bun run build && npm publish --dry-run`
- `tools/opencode-1.16.2/node_modules/.bin/opencode agent list`
