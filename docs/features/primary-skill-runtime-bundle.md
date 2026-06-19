# Primary Skill Runtime Bundle

## Background

The plugin runs workflow nodes through named agents. Each node agent receives exactly one router-assigned primary skill. Support skills such as `using-superpowers`, `executing-plans`, and `subagent-driven-development` describe standalone Superpowers workflows, but the controller already owns routing, confirmation, dispatch, and retry behavior.

## Change

- Keep only primary skills under `assets/skills/`.
- Stop default installation of support skills.
- Leave the complete official Superpowers skill tree under `docs/superpowers/official-skills/` for reference.
- Update README and module docs to describe the runtime bundle as primary-skill-only.

## Acceptance

- `install()` copies only the primary skills assigned in `src/router/modes.ts`.
- Support skills are absent from the runtime `assets/skills/` tree.
- Documentation points readers to the official archive for support-skill source material.
