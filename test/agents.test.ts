import { describe, expect, test } from "bun:test"
import { createAgentConfig } from "../src/agents"
import { AGENT_SKILL_MAP } from "../src/router/modes"

describe("createAgentConfig", () => {
  test("injects the final controller and node agents", () => {
    const agents = createAgentConfig()

    expect(Object.keys(agents).sort()).toEqual([
      "sp-code-reviewer",
      "sp-debugger",
      "sp-designer",
      "sp-finisher",
      "sp-implementer",
      "sp-investigator",
      "sp-planner",
      "sp-spec-reviewer",
      "sp-verifier",
      "super-agent",
    ])
  })

  test("node agent prompts include exactly one primary skill from the shared skill map", () => {
    const agents = createAgentConfig()

    for (const [agentName, primarySkill] of Object.entries(AGENT_SKILL_MAP)) {
      const agent = agents[agentName]
      expect(agent, `${agentName} should be injected`).toBeDefined()
      const prompt = String(agent.prompt ?? "")
      const permission = agent.permission as { skill?: Record<string, string> } | undefined
      expect(prompt, `${agentName} should load ${primarySkill}`).toContain(primarySkill)
      expect(prompt, `${agentName} should describe one primary skill`).toContain("Primary skill:")
      expect(prompt, `${agentName} should not mention control-plane fields`).toContain("Do not include next_action")
      expect(permission?.skill?.["*"], `${agentName} should deny unrelated global skills`).toBe("deny")
      expect(permission?.skill?.[primarySkill], `${agentName} should allow only its primary skill`).toBe("allow")
    }
  })

  test("controller cannot mutate code directly", () => {
    const controller = createAgentConfig()["super-agent"]

    expect(controller?.mode).toBe("primary")
    expect((controller?.permission as { edit?: string } | undefined)?.edit).toBe("deny")
    expect((controller?.tools as { skill?: boolean } | undefined)?.skill).toBe(false)
    expect(String(controller?.prompt ?? "")).toContain("clarify with the user")
    expect(String(controller?.prompt ?? "")).toContain("call sp_prepare")
    expect(String(controller?.prompt ?? "")).toContain("Do not load business or development skills")
  })

  test("inherits global allow permissions for controller and node agents", () => {
    const agents = createAgentConfig({ globalPermission: "allow" })

    for (const [agentName, agent] of Object.entries(agents)) {
      const permission = agent.permission as Record<string, unknown>
      expect(permission.edit, `${agentName} edit permission`).toBe("allow")
      expect(permission.bash, `${agentName} bash permission`).toBe("allow")
      expect(permission.task, `${agentName} task permission`).toBe("allow")
      expect(permission.skill, `${agentName} skill permission`).toBe("allow")
      expect(permission.question, `${agentName} question permission`).toBe("allow")
      expect(permission.plan_enter, `${agentName} plan enter permission`).toBe("allow")
      expect(permission.plan_exit, `${agentName} plan exit permission`).toBe("allow")
      expect(permission.external_directory, `${agentName} external directory permission`).toBe("allow")
      expect(permission.doom_loop, `${agentName} doom loop permission`).toBe("allow")
      expect((permission.read as Record<string, string>)["*"], `${agentName} read permission`).toBe("allow")
      expect((permission.read as Record<string, string>)["*.env"], `${agentName} env read permission`).toBe("allow")
      expect((permission.read as Record<string, string>)["*.env.*"], `${agentName} env variant read permission`).toBe("allow")
    }

    expect((agents["super-agent"]?.tools as { skill?: boolean } | undefined)?.skill).toBeUndefined()
  })
})
