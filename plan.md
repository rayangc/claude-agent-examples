# Claude Agent SDK Learning Plan

## Goal

Learn the Claude Agent SDK by building focused examples that explore each core concept.

---

## Source Material

- **Gist**: https://gist.github.com/dabit3/93a5afe8171753d0dbfd41c80033171d
- **Package**: `@anthropic-ai/claude-agent-sdk`

---

## Learning Modules

### 1. Basic Agent ✅ COMPLETED

**Folder**: `examples/01-basic-agent/`

**Concepts Covered**:
- [x] The `query()` function and async generator pattern
- [x] Message types: `system`, `assistant`, `user`, `result`
- [x] Tool calls (`tool_use` blocks) and tool results (`tool_result` blocks)
- [x] The agent loop - how Claude decides to loop or respond
- [x] Turn tracking and visualization
- [x] `maxTurns` - safety limits and what happens when exceeded
- [x] Result subtypes: `success`, `error_max_turns`, `interrupted`, `error`
- [x] Model selection: `haiku`, `sonnet`, `opus`
- [x] Permission modes: `default`, `acceptEdits`, `bypassPermissions`
- [x] Session resumption with `session_id`
- [x] Cost tracking with `total_cost_usd` and `usage`

**Files Created**:
- `index.ts` - Main example with full message handling and turn tracking
- `max-turns-demo.ts` - Demonstrates maxTurns being exceeded
- `learnings.md` - Summary of concepts learned

---

### 2. Subagents ✅ COMPLETED

**Folder**: `examples/02-subagents/`

**Concepts Covered**:
- [x] What are subagents and why use them
- [x] Defining subagents with specialized roles
- [x] The `agents` configuration option
- [x] How the main agent delegates to subagents
- [x] Subagent-specific tools and model selection
- [x] Communication between main agent and subagents
- [x] Use cases: security reviewer, docs writer, test runner, etc.

**Files Created**:
- `index.ts` - Code review system with 3 specialized subagents
- `learnings.md` - Comprehensive guide to subagents with run observations

**Example Implementation**:
A code review system where the main agent delegates to:
- Security specialist subagent (sonnet - finds vulnerabilities)
- Performance analyst subagent (haiku - spots inefficiencies)
- Documentation checker subagent (haiku - evaluates docs)

**Run Results**: 38 turns, $0.52 cost, comprehensive code review produced

---

### 3. Custom Tools (MCP) ✅ COMPLETED

**Folder**: `examples/03-custom-tools/`

**Concepts Covered**:
- [x] What is MCP (Model Context Protocol)
- [x] Creating custom tools with `createSdkMcpServer`
- [x] Tool definition: name, description, parameters (using Zod)
- [x] Tool implementation: the async handler function
- [x] Registering custom tools with the agent
- [x] Combining built-in tools with custom tools

**Files Created**:
- `index.ts` - MCP server with 3 code metrics tools (count_lines, analyze_complexity, find_dependencies)
- `learnings.md` - Comprehensive guide to custom tools and MCP

**Example Implementation**:
A code metrics server with three tools:
- `count_lines` - Total, code, comment, and blank line counts
- `analyze_complexity` - Cyclomatic complexity with breakdown
- `find_dependencies` - ES6 imports and CommonJS requires

**Run Results**: 7 turns, $0.13 cost, comprehensive code analysis with tables and recommendations

---

### 4. Hooks ✅ COMPLETED

**Folder**: `examples/04-hooks/`

**Concepts Covered**:
- [x] What are hooks and the lifecycle they intercept
- [x] `PreToolUse` hooks - run before a tool executes
- [x] `PostToolUse` hooks - run after a tool executes
- [x] `SessionStart`, `SessionEnd`, and `Stop` hooks
- [x] Hook matchers - targeting specific tools with regex
- [x] Use cases: logging, permission enforcement, command blocking
- [x] Blocking tool calls with `permissionDecision: "deny"`
- [x] Audit trails with timing via `toolUseId` correlation
- [x] Hooks with subagents (don't inherit, must share explicitly)

**Files Created**:
- `index.ts` - Security-focused agent with audit and blocking hooks
- `learnings.md` - Comprehensive guide to hooks

**Example Implementation**:
A security-focused agent that:
- Logs all tool usage to an audit trail with timestamps
- Blocks dangerous bash commands (rm -rf, chmod 777, curl|sh, etc.)
- Uses matchers to apply file-specific hooks to Write/Edit only
- Tracks execution timing via Pre/Post hook correlation

**Run Results**: 5 turns, $0.12 cost, 1 dangerous command blocked

---

### 5. Structured Output ⏳ UP NEXT

**Folder**: `examples/05-structured-output/`

**Concepts to Cover**:
- [ ] Why structured output matters for programmatic use
- [ ] JSON Schema definition for responses
- [ ] Validating agent responses
- [ ] Type-safe responses in TypeScript
- [ ] Error handling for invalid responses

**Planned Example**:
A code review agent that returns structured JSON:
```typescript
{
  issues: [
    { severity: "high", category: "security", file: "...", description: "..." }
  ],
  overallScore: 85,
  summary: "..."
}
```

---

## Project Structure

```
claude-agent-examples/
├── package.json
├── tsconfig.json
├── plan.md                      # This file - learning roadmap
├── examples/
│   ├── 01-basic-agent/          ✅ COMPLETED
│   │   ├── index.ts
│   │   ├── max-turns-demo.ts
│   │   └── learnings.md
│   ├── 02-subagents/            ✅ COMPLETED
│   │   ├── index.ts
│   │   └── learnings.md
│   ├── 03-custom-tools/         ✅ COMPLETED
│   │   ├── index.ts
│   │   └── learnings.md
│   ├── 04-hooks/                ✅ COMPLETED
│   │   ├── index.ts
│   │   └── learnings.md
│   └── 05-structured-output/    ⏳ UP NEXT
│       ├── index.ts
│       └── learnings.md
```

---

## How to Run Examples

```bash
# Install dependencies
npm install

# Run each example
npm run basic        # 01-basic-agent
npm run subagents    # 02-subagents
npm run custom-tools # 03-custom-tools
npm run hooks        # 04-hooks
```

---

## Resuming After Context Loss

If the conversation context is lost, use this file to:

1. **Understand progress**: Check which modules are ✅ COMPLETED vs ⏳ UP NEXT
2. **Review completed work**: Read the `learnings.md` in each completed folder
3. **Continue from where we left off**: Pick up the next ⏳ UP NEXT module
4. **Reference the gist**: https://gist.github.com/dabit3/93a5afe8171753d0dbfd41c80033171d

---

## Notes & Questions Encountered

*(Add notes here as we learn)*

- The `allowedTools` option doesn't seem to strictly restrict tools in the current SDK version
- `message.subtype` for maxTurns is `"error_max_turns"` (not just `"maxTurns"`)
- Subagent `tools` property also doesn't appear to strictly restrict tool access (similar to `allowedTools`)
- Subagent delegation via Task tool appears to be sequential, not truly parallel
- Cost optimization with different models per subagent works well ($0.52 for comprehensive code review)
- Custom MCP tools integrate seamlessly with built-in tools (Claude naturally mixes them)
- Tool naming convention: `mcp__<server-name>__<tool-name>`
- Zod `.describe()` is crucial for Claude to understand parameter purposes
- Tool calls remain sequential even for independent custom tools
- Hooks don't inherit from parent to subagent - must explicitly configure on each agent
- `toolUseId` parameter correlates PreToolUse/PostToolUse pairs for the same operation
- Matchers are regex patterns (e.g., `"Write|Edit"` matches both Write and Edit tools)
- Stop hook fires per-response, SessionEnd fires once when session terminates
