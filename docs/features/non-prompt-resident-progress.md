# Resident Progress Surface Placement

## Intent

Keep Superpowers child-session progress resident in the main TUI while minimizing prompt/input space usage.

## Problem

The broader resident progress slot list made progress more visible, but prompt-adjacent slots can render near the input box during startup or refresh. Removing every prompt-adjacent slot made the current host layout lose the only visible progress anchor. The UI needs a fallback that is visible but short enough not to crowd the input area.

## Scope

- Keep the full `superpowers-progress` route, without registering a TUI command entry.
- Keep compact resident progress in main-session bottom surfaces: `home_bottom` and `app_bottom`.
- Keep sidebar fallback surfaces: `sidebar_content` and `sidebar_footer`.
- Keep `session_prompt_right` as a short fallback indicator capped at 44 characters.
- Do not register `home_prompt_right`.
- Avoid `home_footer` until the host footer semantics are stable enough for a plugin-owned status line.

## Acceptance

- The TUI plugin registers `home_bottom`, `app_bottom`, `sidebar_content`, `sidebar_footer`, and short fallback `session_prompt_right`.
- Parent session, child session, and no-props rendering still show the active workflow compact progress.
- Unrelated session props still hide the line.
- Prompt fallback text is truncated and does not carry full progress detail.
- Pending child questions still take precedence over ordinary progress in the compact text.
