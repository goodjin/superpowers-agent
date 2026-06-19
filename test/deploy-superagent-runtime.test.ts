import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

describe("deploy-superagent-runtime", () => {
  test("persists global allow permissions and writes a super-agent TUI launcher", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "sp-superagent-home-"))
    const runtimeRoot = mkdtempSync(join(tmpdir(), "sp-superagent-runtime-"))

    const result = spawnSync("bash", ["scripts/deploy-superagent-runtime.sh", "deploy"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: tempHome,
        SUPERAGENT_ROOT: runtimeRoot,
        SUPERAGENT_PORT: "5996",
      },
      encoding: "utf8",
    })

    expect(result.status, result.stderr || result.stdout).toBe(0)

    const configPath = join(runtimeRoot, "home", ".config", "opencode", "opencode.json")
    const tuiConfigPath = join(runtimeRoot, "home", ".config", "opencode", "tui.json")
    const launcherPath = join(tempHome, ".local", "bin", "superagent")
    expect(existsSync(configPath)).toBe(true)
    expect(existsSync(tuiConfigPath)).toBe(true)
    expect(existsSync(launcherPath)).toBe(true)

    const config = JSON.parse(readFileSync(configPath, "utf8"))
    expect(config.permission).toBe("allow")
    expect(config.plugin).toEqual([`file://${process.cwd()}/dist/index.js`])

    const tuiConfig = JSON.parse(readFileSync(tuiConfigPath, "utf8"))
    expect(tuiConfig.plugin).toEqual([`file://${process.cwd()}/dist/tui.js`])

    const launcher = readFileSync(launcherPath, "utf8")
    expect(launcher).not.toContain(" web --hostname ")
    expect(launcher).not.toContain(" attach ")
    expect(launcher).toContain('PROJECT_DIR="${SUPERAGENT_PROJECT_DIR:-$PWD}"')
    expect(launcher).not.toContain('PROJECT_DIR="$ROOT/project"')
    expect(launcher).toContain('--agent "super-agent"')
  }, 30_000)
})
