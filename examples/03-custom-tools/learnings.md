# Custom Tools (MCP) - Learnings

## What is MCP?

**Model Context Protocol (MCP)** is Anthropic's open standard for extending AI models with custom capabilities. Think of it as a plugin system for Claude:

- **Built-in tools**: Read, Write, Bash, Glob, Grep, etc. (provided by the SDK)
- **Custom tools**: Your business logic, APIs, databases, proprietary systems

MCP provides a standardized way to define and register custom tools that Claude can use just like built-in ones.

---

## Built-in Tools Reference

The SDK provides these tools out of the box:

### File Operations

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **Read** | Read file contents | Viewing code, configs, docs |
| **Write** | Create/overwrite entire file | New files or full replacements |
| **Edit** | Surgical find-and-replace | Targeted changes without rewriting whole file |
| **Glob** | Find files by pattern | `**/*.ts`, `src/**/*.json` |
| **Grep** | Search file contents (regex) | Find code patterns, function usages |
| **NotebookEdit** | Edit Jupyter notebooks | `.ipynb` cell modifications |

### Command Execution

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **Bash** | Run shell commands | `npm install`, `git commit`, build scripts |
| **KillShell** | Terminate a background shell | Stop runaway processes |

### Agent Orchestration

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **Task** | Spawn subagents | Delegate to specialists (see Module 2) |
| **TaskOutput** | Get results from background tasks | Check on async work |

### Planning Mode

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **EnterPlanMode** | Switch to planning phase | Complex tasks needing design first |
| **ExitPlanMode** | Leave planning, start execution | Plan approved, ready to implement |

### User Interaction

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **AskUserQuestion** | Prompt user for input/choices | Clarify requirements, get preferences |
| **TodoWrite** | Manage task checklist | Track multi-step work, show progress |

### Web Access

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **WebFetch** | Fetch and process a URL | Read docs, APIs, web content |
| **WebSearch** | Search the web | Find current info, research |

### Specialized

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **Skill** | Invoke predefined skills | Slash commands like `/commit` |
| **LSP** | Language Server Protocol | Code intelligence (go-to-definition, etc.) |

### Dedicated Tools vs Bash

File operation tools (Glob, Grep, Read, etc.) are **not** shell wrappers - they're native SDK implementations:

| Aspect | Dedicated Tools | Bash Tool |
|--------|-----------------|-----------|
| **Implementation** | Native SDK code | Shell subprocess |
| **Security** | Sandboxed, controlled | Arbitrary command execution |
| **Hookable** | Can intercept specifically | Must parse command strings |
| **Cross-platform** | Consistent behavior | Platform-dependent |
| **Output** | Structured, predictable | Raw stdout/stderr |

**Why this matters for hooks (Module 4)**:
```typescript
// Can target specific tools
{ matcher: { toolName: "Read" } }   // Only file reads
{ matcher: { toolName: "Bash" } }   // All shell commands
```

### Common Workflow Pattern

For typical coding tasks:
```
Glob → Read → Grep → Edit → Bash
  │      │      │      │      │
  │      │      │      │      └─ Run tests/build
  │      │      │      └─ Make changes
  │      │      └─ Search for patterns
  │      └─ Understand the code
  └─ Find the files
```

---

## Core Concepts

### 1. The `createSdkMcpServer` Function

Creates an MCP server that hosts your custom tools:

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

const myServer = createSdkMcpServer({
  name: "server-name",     // Becomes part of tool names
  version: "1.0.0",        // Semantic version
  tools: [ /* tool definitions */ ]
});
```

### 2. The `tool` Helper Function

Defines a single tool with 4 parts:

```typescript
tool(
  "tool_name",           // 1. Name (snake_case recommended)
  "Description...",      // 2. Description for Claude
  { /* Zod schema */ },  // 3. Input parameters
  async (args) => {...}  // 4. Handler function
)
```

### 3. Tool Naming Convention

Custom MCP tools follow this pattern:
```
mcp__<server-name>__<tool-name>
```

| Server Name | Tool Name | Full Tool ID |
|-------------|-----------|--------------|
| code-metrics | count_lines | `mcp__code-metrics__count_lines` |
| code-metrics | analyze_complexity | `mcp__code-metrics__analyze_complexity` |
| my-api | fetch_users | `mcp__my-api__fetch_users` |

---

## Zod Schemas for Input Validation

[Zod](https://zod.dev/) provides type-safe input validation. The SDK automatically validates inputs before calling your handler.

### Basic Schema

```typescript
{
  filePath: z.string().describe("Path to the file")
}
```

### Common Patterns

```typescript
// Required string
name: z.string().describe("The user's name")

// Optional with default
limit: z.number().default(10).describe("Max results")

// Enum choices
level: z.enum(["low", "medium", "high"]).describe("Priority level")

// Array
tags: z.array(z.string()).describe("List of tags")

// Object
options: z.object({
  verbose: z.boolean(),
  format: z.string()
}).describe("Configuration options")
```

### Why `.describe()` Matters

The `.describe()` method adds documentation that Claude sees:

```typescript
// ❌ Claude only knows the type
filePath: z.string()

// ✅ Claude understands the purpose
filePath: z.string().describe("Absolute path to the TypeScript file to analyze")
```

---

## Handler Function Structure

The async handler receives validated args and returns MCP content:

```typescript
async (args) => {
  // args is type-safe based on your Zod schema
  const result = doSomething(args.filePath);

  return {
    content: [{
      type: "text" as const,  // Required: "text" or "image"
      text: JSON.stringify(result, null, 2)
    }],
    isError: false  // Optional: true if something went wrong
  };
}
```

### Response Format

```typescript
// Success response
{
  content: [{ type: "text", text: "..." }]
}

// Error response
{
  content: [{ type: "text", text: "Error: ..." }],
  isError: true
}
```

---

## Registering Custom Tools

Pass your MCP server in the `mcpServers` option:

```typescript
for await (const message of query({
  prompt: "Analyze the code...",
  options: {
    model: "sonnet",

    // Register custom tools
    mcpServers: {
      "code-metrics": metricsServer,
      "my-api": apiServer  // Can register multiple servers
    },

    // Reference custom tools by full name
    allowedTools: [
      "Glob",  // Built-in
      "Read",  // Built-in
      "mcp__code-metrics__count_lines",      // Custom
      "mcp__code-metrics__analyze_complexity" // Custom
    ]
  }
}))
```

---

## Deep Dive: How Claude Uses Custom Tools

### Discovery

When the agent starts, Claude receives a list of available tools:
```
Available tools:
   Built-in: Task, Bash, Glob, Read, Write, ...
   Custom:   count_lines, analyze_complexity, find_dependencies
```

Claude sees custom tools alongside built-in ones and can choose any based on the task.

### Tool Call Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     CUSTOM TOOL FLOW                         │
└─────────────────────────────────────────────────────────────┘

1. Claude decides to use mcp__code-metrics__count_lines
                    │
                    ▼
2. SDK validates input against Zod schema
   ✓ filePath is a string
                    │
                    ▼
3. Your async handler is called
   async (args) => { ... }
                    │
                    ▼
4. Handler returns MCP content
   { content: [{ type: "text", text: "..." }] }
                    │
                    ▼
5. SDK converts to tool_result message
   { type: "tool_result", content: "..." }
                    │
                    ▼
6. Claude receives result, decides next action
```

---

## Observations from Running the Example

### What Happened

| Turn | Tool Used | Purpose |
|------|-----------|---------|
| 1 | `Glob` (built-in) | Find TypeScript files |
| 2 | `count_lines` (custom) | Analyze index.ts lines |
| 3 | `analyze_complexity` (custom) | Complexity for index.ts |
| 4 | `find_dependencies` (custom) | Dependencies for index.ts |
| 5 | `count_lines` (custom) | Analyze max-turns-demo.ts |
| 6 | `analyze_complexity` (custom) | Complexity for max-turns-demo.ts |
| 7 | `find_dependencies` (custom) | Dependencies for max-turns-demo.ts |

### Key Observations

1. **Seamless Integration**: Claude naturally mixed built-in tools (Glob) with custom tools for a complete analysis

2. **Sequential Execution**: Each tool was called in a separate turn - Claude didn't batch multiple tool calls together

3. **Intelligent Synthesis**: After gathering all metrics, Claude produced a well-formatted markdown report with tables and recommendations

4. **Tool Selection**: Claude correctly chose which custom tool to use based on descriptions:
   - Used `count_lines` for line metrics
   - Used `analyze_complexity` for complexity scoring
   - Used `find_dependencies` for import analysis

### Results

| Metric | Value |
|--------|-------|
| Files analyzed | 2 |
| Turns taken | 7 |
| Cost | $0.13 |
| Custom tool calls | 6 |
| Built-in tool calls | 1 |

---

## Tool Design Best Practices

### 1. Clear, Descriptive Names

```typescript
// ✅ Good - obvious purpose
"count_lines"
"analyze_complexity"
"fetch_user_by_id"

// ❌ Bad - vague or confusing
"process"
"do_thing"
"helper"
```

### 2. Detailed Descriptions

The description helps Claude know when to use the tool:

```typescript
// ✅ Good - explains what, why, and output
"Calculate cyclomatic complexity of a file. Higher numbers indicate
more complex code with more decision paths. Returns complexity score
and breakdown by type."

// ❌ Bad - too brief
"Get complexity"
```

### 3. Rich Parameter Descriptions

```typescript
// ✅ Good - context-rich
filePath: z.string().describe("Absolute path to the TypeScript/JavaScript file to analyze. Must be a valid file path, not a directory.")

// ❌ Bad - minimal
filePath: z.string()
```

### 4. Structured Return Values

Return JSON for complex data so Claude can parse and reason about it:

```typescript
// ✅ Good - structured, parseable
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      file: args.filePath,
      metrics: { total: 138, code: 85, comments: 36 },
      ratio: { codePercent: "61.6", commentPercent: "26.1" }
    }, null, 2)
  }]
};

// ❌ Bad - unstructured prose
return {
  content: [{
    type: "text",
    text: "The file has 138 lines with 85 code lines."
  }]
};
```

### 5. Meaningful Error Messages

```typescript
try {
  // ... tool logic
} catch (error: any) {
  return {
    content: [{
      type: "text",
      text: `Error analyzing ${args.filePath}: ${error.message}`
    }],
    isError: true
  };
}
```

---

## When to Use Custom Tools

| Use Case | Example |
|----------|---------|
| **Proprietary APIs** | Internal company APIs, authenticated services |
| **Database Access** | Query company databases, analytics systems |
| **Business Logic** | Domain-specific calculations, validations |
| **External Services** | Third-party integrations (Slack, Jira, etc.) |
| **Custom Analysis** | Code metrics, data processing, file parsing |
| **Stateful Operations** | Session management, caching, rate limiting |

---

## Common Patterns

### Pattern 1: Wrapping an API

```typescript
tool(
  "get_weather",
  "Get current weather for a location",
  {
    city: z.string().describe("City name"),
    country: z.string().optional().describe("Country code (e.g., US)")
  },
  async (args) => {
    const response = await fetch(
      `https://api.weather.com/v1/current?city=${args.city}&country=${args.country || "US"}`
    );
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }
)
```

### Pattern 2: Database Query

```typescript
tool(
  "query_users",
  "Search users in the database",
  {
    email: z.string().optional(),
    role: z.enum(["admin", "user", "guest"]).optional()
  },
  async (args) => {
    const users = await db.users.find({
      ...(args.email && { email: args.email }),
      ...(args.role && { role: args.role })
    });
    return { content: [{ type: "text", text: JSON.stringify(users) }] };
  }
)
```

### Pattern 3: File Processing

```typescript
tool(
  "parse_csv",
  "Parse a CSV file and return structured data",
  {
    filePath: z.string().describe("Path to CSV file"),
    hasHeaders: z.boolean().default(true)
  },
  async (args) => {
    const content = fs.readFileSync(args.filePath, "utf-8");
    const rows = parseCSV(content, { headers: args.hasHeaders });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          rowCount: rows.length,
          columns: Object.keys(rows[0] || {}),
          preview: rows.slice(0, 5)
        })
      }]
    };
  }
)
```

---

## Known Limitations

1. **`allowedTools` not strictly enforced**: In our run, all tools appeared available regardless of `allowedTools` setting (same issue as noted in previous modules)

2. **Sequential tool calls**: Claude calls tools one at a time, not in parallel (even when multiple could run simultaneously)

3. **No streaming**: Tool handlers run to completion - no streaming partial results

4. **Sync model**: Must await handler completion before proceeding

---

## Key Takeaways

1. **MCP = Plugin System**: Standard way to extend Claude with custom capabilities

2. **4 Parts to a Tool**: Name, description, Zod schema, async handler

3. **Naming Convention**: `mcp__<server>__<tool>` for referencing custom tools

4. **Zod = Type Safety**: Input validation and documentation in one

5. **Return MCP Content**: `{ content: [{ type: "text", text: "..." }] }`

6. **Seamless Integration**: Custom tools work alongside built-in tools naturally

7. **Good Descriptions Matter**: Help Claude choose the right tool for the task

---

## Files in This Example

| File | Purpose |
|------|---------|
| `index.ts` | MCP server with 3 code metrics tools |
| `learnings.md` | This file - comprehensive guide to custom tools |

---

## Running the Example

```bash
# Analyze the basic-agent directory (default)
npm run custom-tools

# Analyze a specific directory
npm run custom-tools ./path/to/code
```
