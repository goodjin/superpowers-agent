# Slot-Specific Progress Surfaces

## Intent

Render Superpowers workflow progress differently by TUI surface so the main session, sidebar, and fallback prompt area do not all show the same compact line, without adding plugin content to the home screen.

## Problem

The resident progress plugin currently registers several slots, but each slot used to share the same compact renderer. That made `app_bottom`, `sidebar_content`, `sidebar_footer`, and `session_prompt_right` compete for the same information instead of matching their available space and context. A follow-up check showed the home screen does not have a useful `sidebar_content` area for this plugin, so home surfaces should stay clean.

## Scope

- Keep `app_bottom` focused on a short whole-workflow status line.
- Use `sidebar_content` with workflow session props as the running child-session list.
- Keep `session_prompt_right` as a short fallback indicator only.
- Do not register `home_bottom`.
- Hide resident progress when a non-compact slot has no session props.
- Keep the detailed per-session process in the `superpowers-progress` route until OpenCode exposes a confirmed main-session content slot.
- Preserve pending child-question precedence in compact fallback text.

## Acceptance

- `app_bottom` renders workflow status, phase, task completion count, and running-session count.
- `sidebar_content` renders running session rows on parent/child session surfaces.
- Home/no-session surfaces render no plugin resident content.
- `session_prompt_right` remains truncated and does not carry full detail.
- The full progress route still renders detailed child-session progress.
