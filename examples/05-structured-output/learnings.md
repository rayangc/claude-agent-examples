# Module 5: Structured Output - Learnings

## Core Concept

Structured output enforces a JSON schema on agent responses, enabling programmatic processing.

```typescript
options: {
  outputFormat: {
    type: "json_schema",
    schema: mySchema  // JSON Schema object
  }
}
```

Access results via `message.structured_output` when `message.subtype === "success"`.

---

## Key Discovery: StructuredOutput is a Tool

The SDK creates a special `StructuredOutput` tool that Claude calls to format its response:

```
Turn 1: Read (reads the file)
Turn 2: StructuredOutput (formats response to match schema)
```

This explains why structured output "just works" — Claude uses a dedicated tool to ensure compliance.

---

## Run Results

| Metric | Value |
|--------|-------|
| Turns | 2 |
| Cost | $0.15 |
| Issues Found | 12 |
| Score | 35/100 |

---

## Permissions vs Hooks

Two distinct systems that work at different layers:

| Aspect | Permissions | Hooks |
|--------|-------------|-------|
| What | Built-in Claude Code CLI safety | Custom callbacks in SDK |
| Where | Application level | Your agent code |
| Purpose | Protect user's system | Customize agent behavior |
| Control | User-facing prompts | Developer-defined logic |

**Execution order:**
```
Tool Call → PreToolUse Hooks → Permission System → Tool Executes → PostToolUse Hooks
```

Hooks can return `{ permissionDecision: "deny" }` to block, mimicking permissions but with custom logic.

---

## Interactive Hooks

Hooks are async — you can implement any approval flow:

```typescript
const interactiveHook: HookCallback = async (input) => {
  // Wait for external approval (Discord, Slack, webhook, terminal prompt)
  const approved = await waitForDiscordApproval(input);

  if (!approved) {
    return { hookSpecificOutput: { permissionDecision: "deny" } };
  }
  return {};
};
```

**No built-in "ask user" mechanism** — you implement the prompting yourself.

---

## Background Subagents

Spawn non-blocking subagents with `run_in_background: true`:

```typescript
// Returns immediately with:
// { task_id: "abc-123", output_file: "/tmp/agent-output-abc-123.txt" }
```

**Communication options:**
- Read output file for streaming progress
- `TaskOutput({ task_id, block: false })` for status check
- `TaskOutput({ task_id, block: true })` to wait for completion

**Key limitation:** Output file only contains what you `console.log`. The SDK doesn't auto-log thinking or tool calls.

---

## Handling Irrelevant Context

When input doesn't match expected schema (e.g., prose file for code review):

### Option 1: Add "applicable" field
```typescript
{
  applicable: { type: "boolean" },
  reason: { type: "string" },  // Explain if not applicable
  // ... other fields optional
}
```

### Option 2: Discriminated union
```typescript
{
  oneOf: [
    { properties: { type: { const: "code_review" }, issues: {...} } },
    { properties: { type: { const: "not_applicable" }, reason: {...} } }
  ]
}
```

---

## Agent Collaboration Patterns

Without structured output, agents communicate via:

| Pattern | Description | Tradeoff |
|---------|-------------|----------|
| **Natural Language** | Main agent interprets prose | Flexible but fuzzy |
| **Convention-Based** | Agreed markdown sections | Semi-structured |
| **File-Based** | Write/read JSON files | Clean contract, slight I/O overhead |
| **Hybrid** | Text + embedded JSON block | Best of both |

### File-Based Deep Dive

**Clean separation** = contract-based decoupling:
- Agents agree on file path + JSON schema
- Implementation details hidden
- Easy to test (mock files), debug (inspect files), swap implementations

**I/O overhead** = ~2-10ms for file operations:
- Negligible vs API calls (5-30 seconds)
- Only matters in high-frequency loops or real-time systems

---

## When to Use Structured Output

### Use When
- CI/CD integration (machine-readable pass/fail)
- Database storage (results map to schema)
- API responses (consistent format)
- Multi-system pipelines (output feeds automation)

### Avoid When
- Exploratory analysis (discoveries may not fit schema)
- Creative tasks (rigid format limits expression)
- Nuanced responses ("it depends" doesn't fit enums)
- One-off tasks (schema overhead not worth it)

### Rule of Thumb
> Start unstructured, add structure when you hit parsing pain.

---

## Schema Design Tips

1. **Build escape hatches** — Always ask "what if the happy path doesn't apply?"
2. **Use enums sparingly** — Too restrictive can force bad fits
3. **Make fields optional** when they might not apply
4. **Add metadata fields** — `filesReviewed`, `timestamp`, `confidence`
5. **Test edge cases** — Empty input, wrong file type, ambiguous content

---

## Code Patterns

### Basic Structured Output
```typescript
for await (const message of query({
  prompt: "Review this code...",
  options: {
    outputFormat: {
      type: "json_schema",
      schema: reviewSchema
    }
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    const result = message.structured_output as ReviewResult;
    // Process typed result
  }
}
```

### Schema with Escape Hatch
```typescript
const schema = {
  type: "object",
  properties: {
    applicable: { type: "boolean" },
    reason: { type: "string" },
    // Only required when applicable: true
    issues: { type: "array", items: {...} },
    score: { type: "integer", minimum: 0, maximum: 100 }
  },
  required: ["applicable"]  // Minimal requirements
};
```

### Observability for Background Agents
```typescript
const log = (event: string, data?: object) =>
  console.log(JSON.stringify({ event, ...data, ts: Date.now() }));

// Usage in hooks
log("approval_requested", { tool: input.tool_name });
log("approval_resolved", { approved: true });
```

---

## Questions Answered

| Question | Answer |
|----------|--------|
| Can hooks ask for user input? | Yes, they're async — implement any approval flow |
| Do subagents block main agent? | Yes by default; use `run_in_background` for parallel |
| What goes in output file? | Only explicit `console.log` statements |
| How handle wrong file type? | Add `applicable` field or use discriminated union |
| File-based overhead? | ~2-10ms, negligible vs API calls |
