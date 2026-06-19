import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTuiPluginModule } from "../src/tui"

describe("Superpowers TUI plugin", () => {
  test("registers the progress route", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-tui-plugin-"))
    try {
      const routes: Array<{ name: string; render: () => unknown }> = []
      const commands: Array<{ title: string; value: string; onSelect?: () => void }> = []
      const navigated: Array<{ name: string; params?: Record<string, unknown> }> = []
      const plugin = createTuiPluginModule()

      await plugin.tui(
        {
          route: {
            register(input: Array<{ name: string; render: () => unknown }>) {
              routes.push(...input)
              return () => {}
            },
            navigate(name: string, params?: Record<string, unknown>) {
              navigated.push({ name, params })
            },
          },
          command: {
            register(callback: () => Array<{ title: string; value: string; onSelect?: () => void }>) {
              commands.push(...callback())
              return () => {}
            },
          },
          state: {
            path: { directory: project },
            session: {
              status() {
                return { type: "busy" }
              },
            },
          },
        } as never,
        undefined,
        { id: "superpowers-controller", source: "file", spec: "", target: "", first_time: 0, last_time: 0, time_changed: 0, load_count: 1, fingerprint: "", state: "first" },
      )

      expect(routes.map((route) => route.name)).toContain("superpowers-progress")
      expect(String(routes[0]?.render())).toContain("Superpowers Progress")
      expect(commands.map((command) => command.value)).toContain("superpowers.progress")
      commands.find((command) => command.value === "superpowers.progress")?.onSelect?.()
      expect(navigated).toEqual([{ name: "superpowers-progress", params: undefined }])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
