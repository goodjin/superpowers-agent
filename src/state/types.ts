export type WorkflowKind =
  | "feature"
  | "debug"
  | "plan-only"
  | "review"
  | "verify-finish"
  | "parallel-investigate"

export type WorkflowMode =
  | "idle"
  | "design"
  | "plan"
  | "execute"
  | "debug"
  | "parallel-investigate"
  | "review"
  | "verify-finish"

export type WorkflowGate =
  | "request_confirmed"
  | "design_approved"
  | "spec_written"
  | "plan_written"
  | "root_cause_found"
  | "red_test_seen"
  | "implementation_done"
  | "spec_review_passed"
  | "code_review_passed"
  | "verification_fresh"

export type WorkflowArtifact =
  | "request"
  | "spec"
  | "plan"
  | "root_cause"
  | "red_test_log"
  | "patch_summary"
  | "spec_review"
  | "code_review"
  | "verification_log"
  | "finish_note"

export type NodeEvent =
  | "intake"
  | "question"
  | "design"
  | "plan"
  | "debug"
  | "red-test"
  | "implementation"
  | "spec-review"
  | "code-review"
  | "verification"
  | "finish"

export type NodeStatus = "passed" | "failed" | "blocked" | "needs_user"

export type TaskGraph = {
  tasks: Array<{
    id: string
    title: string
    summary: string
    depends_on: string[]
    files?: string[]
    test_commands?: string[]
  }>
}

export type SpRecordInput = {
  event: NodeEvent
  status: NodeStatus
  summary: string
  artifacts?: Partial<Record<WorkflowArtifact, string>>
  gates?: Partial<Record<WorkflowGate, boolean>>
  checks?: string
  findings?: string
  question?: {
    prompt: string
    options?: string[]
  }
  task_graph?: TaskGraph
}

export type WorkflowState = {
  id: string
  project: string
  session: string
  mode: WorkflowMode
  phase: string
  goal: string
  created_at: string
  updated_at: string
  gates: Partial<Record<WorkflowGate, boolean>>
  artifacts: Partial<Record<WorkflowArtifact, string>>
  task_graph?: TaskGraph
  pending_question?: SpRecordInput["question"]
  history: Array<{
    at: string
    event: string
    from?: string
    to?: string
    status?: NodeStatus
    summary?: string
  }>
  next?: string
}

export type WorkflowRecord = SpRecordInput
