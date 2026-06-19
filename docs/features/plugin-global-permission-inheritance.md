# Plugin Global Permission Inheritance

## Intent

When the isolated Superagent runtime sets OpenCode global `permission` to `"allow"`, plugin-generated agents should inherit that posture instead of reintroducing agent-level `ask` or `deny` rules that cause repeated confirmation prompts.

## Scope

- Update `src/agents/index.ts` so `createAgentConfig` can see the host global permission mode.
- Update `src/plugin.ts` so the plugin passes `hostConfig.permission` into agent generation.
- Read the active OpenCode config from `XDG_CONFIG_HOME` or `HOME` when the plugin config hook does not include `permission`.
- Preserve the existing controller and node permission boundaries when global permission is not `"allow"`.
- Keep plugin workflow gates in `src/router/gates.ts` unchanged; this change only controls OpenCode permission prompts.

## Acceptance

- Default agent config still denies direct controller edits and limits node skills to the assigned primary skill.
- With global `permission: "allow"`, `super-agent` and all `sp-*` agents emit allow rules for read, edit, bash, task, question, plan, external directory, and skill permission points.
- With global `permission: "allow"`, `super-agent` does not disable the `skill` tool through `tools.skill = false`.
- If `hostConfig.permission` is omitted, the plugin still detects `"permission": "allow"` from the active OpenCode config file.
- Unit tests cover both default restricted behavior and global allow inheritance.
