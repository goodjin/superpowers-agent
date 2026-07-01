#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="${SUPERPOWERS_CONTROLLER_PACKAGE:-superpowers-controller}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  command_exists "$1" || die "$1 is required but was not found in PATH."
}

run_controller() {
  local command="$1"
  if [[ -f "$REPO_ROOT/package.json" && -f "$REPO_ROOT/src/cli/index.ts" ]]; then
    (cd "$REPO_ROOT" && bun run src/cli/index.ts "$command")
  else
    bunx "$PACKAGE_NAME" "$command"
  fi
}

doctor_allows_only_missing_opencode() {
  local output="$1"
  local failures
  failures="$(printf '%s\n' "$output" | grep '^fail ' | grep -v '^fail opencode: opencode executable not found$' || true)"
  [[ -z "$failures" ]]
}

main() {
  require_command bash
  require_command bun

  if ! command_exists opencode; then
    log "warning: opencode was not found in PATH. The plugin can be installed now, but OpenCode must be installed before use."
  fi

  log "Installing Superpowers Controller..."
  local install_output
  if ! install_output="$(run_controller install 2>&1)"; then
    printf '%s\n' "$install_output" >&2
    die "install command failed"
  fi
  printf '%s\n' "$install_output"

  log ""
  log "Running doctor..."
  local doctor_output
  local doctor_status=0
  doctor_output="$(run_controller doctor 2>&1)" || doctor_status=$?
  printf '%s\n' "$doctor_output"

  if [[ "$doctor_status" -ne 0 ]] && ! doctor_allows_only_missing_opencode "$doctor_output"; then
    die "doctor reported failed checks"
  fi

  log ""
  if [[ "$doctor_status" -ne 0 ]]; then
    log "Installed with warning: install OpenCode, then run: bunx $PACKAGE_NAME doctor"
  else
    log "Superpowers Controller installed."
  fi
  log "Validate OpenCode can see the agent with: opencode agent list"
  log "Start with: opencode --agent super-agent"
}

main "$@"
