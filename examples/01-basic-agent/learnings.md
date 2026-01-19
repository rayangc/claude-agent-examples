# Basic Agent Learnings

## Overview

The Claude Agent SDK provides an infrastructure layer for building AI agents. The core function `query()` handles the entire agent loop for you - eliminating the need to manually manage tool calls and responses.

---

## Core Concepts

### 1. The `query()` Function

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Your task here",
  options: {
    model: "sonnet",
    maxTurns: 10,
    permissionMode: "bypassPermissions",
  },
})) {
  // Handle messages as they stream
}
```

- Returns an **async generator** that yields messages over time
- Use `for await...of` to consume messages as they arrive
- The SDK handles the entire agent loop internally

---

### 2. Message Types

The stream yields four distinct message types:

| Type | When | Contains |
|------|------|----------|
| `system` | First message | `session_id`, available `tools` |
| `assistant` | Claude responds | `text` blocks and/or `tool_use` blocks |
| `user` | After tool execution | `tool_result` blocks |
| `result` | Last message | `subtype`, `total_cost_usd`, `usage` |

---

### 3. Tool Calls and Results

**Tool calls** appear in `assistant` messages:
```typescript
if (block.type === "tool_use") {
  block.id      // Unique identifier (e.g., "toolu_01ABC...")
  block.name    // Tool name (e.g., "Read", "Bash")
  block.input   // Arguments passed to the tool
}
```

**Tool results** appear in `user` messages:
```typescript
if (block.type === "tool_result") {
  block.tool_use_id  // Matches the original block.id
  block.content      // The result (string or array)
  block.is_error     // true if the tool failed
}
```

---

## The Agent Loop

This is the key concept that makes agents powerful.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                      THE AGENT LOOP                         │
│                                                             │
│  ┌──────────────────┐                                       │
│  │  Send prompt to  │                                       │
│  │     Claude       │                                       │
│  └────────┬─────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐     ┌─────────────────┐              │
│  │ Claude responds  │────▶│  Text response  │───▶ DONE     │
│  │                  │     │  (no tool calls)│              │
│  └────────┬─────────┘     └─────────────────┘              │
│           │                                                 │
│           │ tool_use blocks                                 │
│           ▼                                                 │
│  ┌──────────────────┐                                       │
│  │  SDK executes    │                                       │
│  │  the tools       │                                       │
│  └────────┬─────────┘                                       │
│           │                                                 │
│           │ tool_result blocks                              │
│           ▼                                                 │
│  ┌──────────────────┐                                       │
│  │  Send results    │                                       │
│  │  back to Claude  │──────────────┐                        │
│  └──────────────────┘              │                        │
│           ▲                        │                        │
│           │                        │                        │
│           └────────────────────────┘                        │
│                  (loop continues)                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Insight

After receiving tool results, Claude **decides** whether to:
- **Loop again** - invoke more tools to gather more information
- **Respond** - return a final text answer to the user

This decision-making is what makes it an "agent" rather than a single API call.

---

## The `maxTurns` Safety Limit

### What It Does

`maxTurns` limits how many tool-use iterations the agent can perform.

### What Happens When Reached

- The agent **stops abruptly** - no graceful summary
- `message.subtype` becomes `"error_max_turns"`
- The task is left **incomplete**

### Scenarios That Cause Long Loops

| Scenario | Example |
|----------|---------|
| Vague prompts | "Find all the bugs in this codebase" |
| Perfectionist behavior | "Make sure the code is completely secure" |
| Circular dependencies | "Update A to match B, and B to match A" |
| Retry loops | Agent keeps trying failed operations |
| Large search spaces | "Search all files in node_modules" |
| Ambiguous success criteria | "Improve the performance" |

### Best Practices

| Strategy | Example |
|----------|---------|
| Specific prompts | "Read package.json and tell me the version" |
| Clear completion criteria | "Find the first 3 bugs" |
| Bounded scope | "Check files in src/" |
| Reasonable maxTurns | 10-20 for focused tasks, 50+ for complex ones |
| Handle the error | Check `message.subtype` and inform the user |

---

## Result Subtypes

```typescript
message.subtype === "success"         // Agent finished normally
message.subtype === "error_max_turns" // Hit the turn limit
message.subtype === "interrupted"     // User cancelled
message.subtype === "error"           // Something went wrong
```

---

## Model Selection

| Model | Best For | Cost | Speed |
|-------|----------|------|-------|
| `"haiku"` | Simple tasks, high volume | $ | Fast |
| `"sonnet"` | Balanced - most tasks | $$ | Medium |
| `"opus"` | Complex reasoning | $$$ | Slower |

---

## Permission Modes

```typescript
permissionMode: "default"           // Prompts user for each tool
permissionMode: "acceptEdits"       // Auto-approves file changes
permissionMode: "bypassPermissions" // No prompts (use carefully!)
```

---

## Session Resumption

Save the `session_id` from the system message to continue conversations:

```typescript
// First conversation
let sessionId: string;
for await (const message of query({ prompt: "..." })) {
  if (message.type === "system") {
    sessionId = message.session_id;
  }
}

// Resume later
for await (const message of query({
  prompt: "Follow-up question",
  options: { resume: sessionId },
})) {
  // Claude remembers previous context!
}
```

---

## Cost Tracking

Always available in the `result` message:

```typescript
if (message.type === "result" && message.subtype === "success") {
  console.log(message.total_cost_usd);  // Total API cost
  console.log(message.usage.input_tokens);
  console.log(message.usage.output_tokens);
}
```

---

## Files in This Example

| File | Purpose |
|------|---------|
| `index.ts` | Main example with full message handling and turn tracking |
| `max-turns-demo.ts` | Demonstrates what happens when `maxTurns` is exceeded |
| `LEARNINGS.md` | This file - summary of concepts |

---

## Running the Examples

```bash
# Run the basic agent
npm run basic

# Run with a specific directory
npm run basic /path/to/explore

# Run the maxTurns demo
npx tsx examples/01-basic-agent/max-turns-demo.ts
```
