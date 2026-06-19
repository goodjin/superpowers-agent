import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("package entrypoints", () => {
  test("builds and exports the TUI plugin entry", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>
      exports: Record<string, unknown>
    }

    expect(pkg.scripts.build).toContain("src/tui.ts")
    expect(pkg.exports["./tui"]).toEqual({
      types: "./dist/tui.d.ts",
      import: "./dist/tui.js",
    })
  })
})
