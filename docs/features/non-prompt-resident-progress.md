# Non-Prompt Resident Progress

## Intent

Keep Superpowers child-session progress resident in the main TUI without consuming prompt/input space.

## Problem

The broader resident progress slot list made progress more visible, but prompt-adjacent slots can render near the input box during startup or refresh. That crowds controls that users need for normal chat input and confirmation actions.

## Scope

- Keep the full `superpowers-progress` route and `superpowers.progress` command unchanged.
- Keep compact resident progress in main-session bottom surfaces: `home_bottom` and `app_bottom`.
- Keep sidebar fallback surfaces: `sidebar_content` and `sidebar_footer`.
- Remove prompt/input-adjacent registrations: `session_prompt_right` and `home_prompt_right`.
- Avoid `home_footer` until the host footer semantics are stable enough for a plugin-owned status line.

## Acceptance

- The TUI plugin registers only `home_bottom`, `app_bottom`, `sidebar_content`, and `sidebar_footer` for compact progress.
- Parent session, child session, and no-props rendering still show the active workflow compact progress.
- Unrelated session props still hide the line.
- Pending child questions still take precedence over ordinary progress in the compact text.
