# Official Superpowers Skills Archive

This directory is a documentation archive of the official Superpowers skills from the locally installed Codex plugin cache.

## Source

- Source path: `/Users/jin/.codex/plugins/cache/openai-curated/superpowers/c6ea566d/skills`
- Copied on: 2026-06-16
- Scope: complete `skills/` tree, including `SKILL.md`, prompts, references, scripts, and agent config files.

## Skill Count

The archive contains 14 official skill directories:

- `brainstorming`
- `dispatching-parallel-agents`
- `executing-plans`
- `finishing-a-development-branch`
- `receiving-code-review`
- `requesting-code-review`
- `subagent-driven-development`
- `systematic-debugging`
- `test-driven-development`
- `using-git-worktrees`
- `using-superpowers`
- `verification-before-completion`
- `writing-plans`
- `writing-skills`

## Relationship To Runtime Skills

The runtime bundle under `assets/skills/` contains only the primary skills directly assigned by `src/router/modes.ts`. Support skills such as `using-superpowers`, `executing-plans`, `subagent-driven-development`, `receiving-code-review`, `using-git-worktrees`, and `writing-skills` stay in this archive for source review instead of being installed by default.

This archive is for source review, comparison, and documentation. Updating files here does not change runtime behavior unless the corresponding files under `assets/skills/` and related router/install logic are updated separately.
