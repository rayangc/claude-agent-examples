# Hooks - Learnings

## What Are Hooks?

Hooks intercept the agent lifecycle at specific points, allowing you to:
- **Log** tool usage for audit trails
- **Block** dangerous operations before they execute
- **Track** timing and metrics
- **Validate** inputs or outputs

Think of hooks as middleware for agent tool calls.

---

## Hook Types

| Hook | When It Fires | Fires Per |
|------|---------------|-----------|
| **SessionStart** | Session begins | Once per session |
| **PreToolUse** | Before each tool executes | Each tool call |
| **PostToolUse** | After each tool completes | Each tool call |
| **Stop** | Agent finishes a response | Each response |
| **SessionEnd** | Session terminates | Once per session |

### Stop vs SessionEnd (Restaurant Analogy 🍽️)

| Hook | Restaurant Equivalent | Can Resume After? |
|------|----------------------|-------------------|
| **Stop** | Waiter delivers a course, checks if you want more | Yes |
| **SessionEnd** | Customer pays bill, closes tab, leaves | No |

A single session can have multiple stops (via session resumption), but only one session end.

---

## Hook Configuration Structure

```typescript
hooks: {
  PreToolUse: [
    { hooks: [hook1, hook2] },              // All tools (no matcher)
    { matcher: "Bash", hooks: [hook3] },    // Bash only
    { matcher: "Write|Edit", hooks: [hook4] }, // Write OR Edit
  ],

  PostToolUse: [
    { hooks: [hook5] },
  ],

  SessionStart: [{ hooks: [initHook] }],
  SessionEnd: [{ hooks: [cleanupHook] }],
  Stop: [{ hooks: [summaryHook] }],
}
```

### Key Points

| Aspect | Behavior |
|--------|----------|
| **Array of configs** | Each config has optional `matcher` + `hooks` array |
| **Execution order** | Configs evaluated in array order |
| **Multiple hooks per config** | `{ hooks: [a, b, c] }` runs all three |
| **Early exit on deny** | PreToolUse `deny` stops execution immediately |

---

## Matchers

Matchers are **regex patterns** that filter which tools trigger a hook.

| Matcher | Tools Matched |
|---------|---------------|
| `"Bash"` | Bash only |
| `"Write\|Edit"` | Write or Edit |
| `"mcp__.*"` | All custom MCP tools |
| `"Read\|Glob\|Grep"` | All read-only tools |
| *(no matcher)* | All tools |

```typescript
// Only fires for Write and Edit
{ matcher: "Write|Edit", hooks: [fileWriteHook] }
```

---

## Hook Callback Signature

```typescript
const myHook: HookCallback = async (input, toolUseId, { signal }) => {
  // input.tool_name  - "Bash", "Read", etc.
  // input.tool_input - { command: "...", file_path: "...", etc. }
  // toolUseId        - Unique ID for this tool call (correlates Pre/Post)
  // signal           - AbortSignal for cancellation

  return {};  // Allow operation
};
```

### The `toolUseId` Parameter

The same `toolUseId` is passed to both PreToolUse and PostToolUse for the same operation. Use it to:
- Track execution duration (store start time in Pre, calculate in Post)
- Correlate inputs with outputs
- Build complete audit entries

```typescript
const startTimes = new Map<string, number>();

const preHook: HookCallback = async (input, toolUseId) => {
  startTimes.set(toolUseId, Date.now());
  return {};
};

const postHook: HookCallback = async (input, toolUseId) => {
  const duration = Date.now() - startTimes.get(toolUseId)!;
  console.log(`Tool took ${duration}ms`);
  return {};
};
```

---

## Blocking Operations

Return a `deny` decision from PreToolUse to block a tool:

```typescript
const securityHook: HookCallback = async (input, toolUseId) => {
  if (input.tool_name === "Bash") {
    const command = input.tool_input?.command as string;

    if (/rm\s+-rf/.test(command)) {
      return {
        hookSpecificOutput: {
          permissionDecision: "deny",
          permissionDecisionReason: "Blocked: rm -rf is not allowed",
        },
      };
    }
  }

  return {};  // Allow
};
```

### Dangerous Patterns to Block

| Pattern | Risk |
|---------|------|
| `rm -rf /` | Recursive delete from root |
| `chmod 777` | Insecure permissions |
| `curl \| sh` | Remote code execution |
| `cat ~/.ssh/*` | Credential exposure |
| `dd of=/dev/` | Disk destruction |

---

## Hooks with Subagents

**Critical:** Hooks do NOT inherit from parent to subagent.

```
Parent Agent (has security hooks)
    │
    ├─► Read tool ──► Hooks fire ✅
    │
    └─► Spawns Subagent (no hooks configured)
            │
            └─► Bash tool ──► NO hooks fire ⚠️
```

### Sharing Hooks Across Agents

Define once, reference everywhere:

```typescript
// Shared hook definitions
const securityHooks = {
  PreToolUse: [{ matcher: "Bash", hooks: [blockDangerousCommands] }],
};

const auditHooks = {
  PreToolUse: [{ hooks: [auditLogger] }],
  PostToolUse: [{ hooks: [auditLogger] }],
};

// Apply to all agents
options: {
  hooks: { ...securityHooks, ...auditHooks },

  agents: [
    {
      name: "code-writer",
      hooks: { ...securityHooks, ...auditHooks },  // Same protection
    },
    {
      name: "researcher",
      hooks: auditHooks,  // Audit only, no security blocking (read-only)
    },
  ],
}
```

### Security Implications

| Configuration | Risk Level |
|--------------|------------|
| Parent has hooks, subagent doesn't | ⚠️ **HIGH** - Subagent bypasses security |
| Same hooks on both | ✅ Safe |
| Stricter hooks on subagent | ✅ Safe (defense in depth) |

---

## Audit Trail Pattern

```typescript
interface AuditEntry {
  timestamp: string;
  toolName: string;
  toolUseId: string;
  phase: "pre" | "post";
  input?: Record<string, unknown>;
  duration?: number;
  blocked?: boolean;
  blockReason?: string;
}

const auditTrail: AuditEntry[] = [];

// Collect during execution, summarize at end
hooks: {
  PreToolUse: [{ hooks: [recordPreAudit] }],
  PostToolUse: [{ hooks: [recordPostAudit] }],
  SessionEnd: [{ hooks: [persistAuditTrail] }],
}
```

---

## Execution Flow Diagram

```
SessionStart
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│   PreToolUse (all hooks) ──┬──► DENIED ──► Skip    │
│          │                 │                        │
│          ▼                 │                        │
│   PreToolUse (matched) ────┤                        │
│          │                 │                        │
│          ▼                 │                        │
│     Tool Executes ◄────────┘                        │
│          │                                          │
│          ▼                                          │
│   PostToolUse (all hooks)                           │
│          │                                          │
│          ▼                                          │
│   (repeat for each tool)                            │
│                                                     │
└─────────────────────────────────────────────────────┘
     │
     ▼
   Stop (agent finished responding)
     │
     ▼
   (may resume session with new prompt)
     │
     ▼
SessionEnd (session terminated)
```

---

## Run Results

| Metric | Value |
|--------|-------|
| Turns | 5 |
| Cost | $0.12 |
| Tools called | 5 (Read, Glob, Bash x2, Write) |
| Blocked operations | 1 (`rm -rf /`) |
| Total execution time | 1327ms |

### What We Observed

1. **PreToolUse fired first** for every tool call
2. **PostToolUse fired after** with matching `toolUseId`
3. **Matcher worked** - `fileWriteHook` only fired for Write, not other tools
4. **Blocking worked** - `rm -rf /` was denied before execution
5. **Timing captured** - Duration calculated via Pre/Post correlation

---

## Common Use Cases

| Use Case | Hook Type | Matcher |
|----------|-----------|---------|
| Audit all tool usage | Pre + Post | *(none)* |
| Block dangerous commands | PreToolUse | `"Bash"` |
| Track file modifications | PreToolUse | `"Write\|Edit"` |
| Rate limit API calls | PreToolUse | `"mcp__.*"` |
| Log execution timing | Pre + Post | *(none)* |
| Initialize resources | SessionStart | N/A |
| Cleanup connections | SessionEnd | N/A |

---

## Key Takeaways

1. **5 hook types** - SessionStart, PreToolUse, PostToolUse, Stop, SessionEnd

2. **Matchers = regex** - Filter which tools trigger a hook

3. **`toolUseId` correlates pairs** - Same ID for Pre and Post of same call

4. **Block with `permissionDecision: "deny"`** - Stops execution before it happens

5. **Hooks don't inherit** - Subagents need explicit hook configuration

6. **Share via reference** - Define hooks once, use across multiple agents

7. **Stop ≠ SessionEnd** - Stop is per-response, SessionEnd is per-session

---

## Files in This Example

| File | Purpose |
|------|---------|
| `index.ts` | Security-focused agent with audit hooks |
| `learnings.md` | This file |
| `test-output.txt` | File created during the demo run |
