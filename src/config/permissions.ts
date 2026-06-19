import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "jsonc-parser"

type PermissionEnv = Record<string, string | undefined>

export function resolveGlobalPermission(hostPermission: unknown, env: PermissionEnv = process.env): unknown {
  if (hostPermission !== undefined) return hostPermission
  return readOpenCodePermission(env)
}

export function isGlobalPermissionAllow(permission: unknown): boolean {
  if (permission === "allow") return true
  if (!permission || typeof permission !== "object" || Array.isArray(permission)) return false

  const rules = permission as Record<string, unknown>
  return rules["*"] === "allow"
}

function readOpenCodePermission(env: PermissionEnv): unknown {
  for (const configPath of candidateConfigPaths(env)) {
    if (!existsSync(configPath)) continue
    const parsed = parse(readFileSync(configPath, "utf8"))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return (parsed as Record<string, unknown>).permission
    }
  }
  return undefined
}

function candidateConfigPaths(env: PermissionEnv): string[] {
  const paths: string[] = []
  if (env.XDG_CONFIG_HOME) {
    paths.push(join(env.XDG_CONFIG_HOME, "opencode", "opencode.jsonc"))
    paths.push(join(env.XDG_CONFIG_HOME, "opencode", "opencode.json"))
    paths.push(join(env.XDG_CONFIG_HOME, "opencode.jsonc"))
    paths.push(join(env.XDG_CONFIG_HOME, "opencode.json"))
  }
  if (env.HOME) {
    paths.push(join(env.HOME, ".config", "opencode", "opencode.jsonc"))
    paths.push(join(env.HOME, ".config", "opencode", "opencode.json"))
  }
  return paths
}
