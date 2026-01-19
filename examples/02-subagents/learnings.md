# Subagents - Learnings

## What Are Subagents?

Subagents are **specialized AI assistants** that the main agent can delegate tasks to. Think of them as expert consultants:

- The **main agent** acts as a coordinator/manager
- **Subagents** are specialists called in for specific tasks
- Each subagent has its own personality, tools, and even model

## Why Use Subagents?

1. **Specialization**: Each subagent can be finely tuned for a specific domain (security, performance, documentation)

2. **Cost Optimization**: Different subagents can use different models:
   - Complex analysis → `sonnet` or `opus`
   - Simple checks → `haiku` (faster and cheaper)

3. **Separation of Concerns**: Each subagent has a focused system prompt, making it better at its specific task

4. **Parallel Analysis**: The main agent can potentially delegate to multiple subagents for comprehensive analysis

## Subagent Configuration

Subagents are defined in the `agents` option:

```typescript
options: {
  agents: {
    "subagent-name": {
      description: "What the main agent sees - helps it decide when to use this subagent",
      prompt: "System instructions that define the subagent's personality and focus",
      tools: ["Read", "Grep", "Glob"],  // Tools this subagent can use
      model: "sonnet"  // or "haiku", "opus"
    }
  }
}
```

### Configuration Properties

| Property | Purpose | Example |
|----------|---------|---------|
| `description` | Tells the main agent what this subagent does | "Security specialist for vulnerability detection" |
| `prompt` | System instructions shaping behavior | "You are a security expert. Focus on..." |
| `tools` | Available tools for this subagent | `["Read", "Grep", "Glob"]` |
| `model` | Claude model to use | `"sonnet"`, `"haiku"`, `"opus"` |

## How Delegation Works

1. The main agent receives a task
2. Based on subagent `descriptions`, it decides which specialist to call
3. It uses the **Task tool** with `subagent_type` parameter
4. The subagent executes with its own prompt, tools, and model
5. Results return to the main agent for synthesis

```
┌─────────────────────────────────────────────────────────┐
│                     Main Agent                          │
│  (Coordinator - receives task, delegates, synthesizes)  │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Security   │  │ Performance │  │    Docs     │
│  Reviewer   │  │   Analyst   │  │   Checker   │
│  (sonnet)   │  │   (haiku)   │  │   (haiku)   │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Deep Dive: Subagent Spawning Mechanism

Understanding HOW subagents are spawned reveals an elegant design decision in the SDK.

### It's Just a Tool Call!

Subagents are spawned using the **Task tool** with a `subagent_type` parameter. No special primitives—just regular tool calling:

```typescript
// What the main agent sends (a standard tool_use block)
{
  type: "tool_use",
  id: "toolu_01ABC...",
  name: "Task",                          // Regular Task tool
  input: {
    subagent_type: "security-reviewer",  // Which subagent to use
    description: "Security review of basic-agent",
    prompt: "Please perform a comprehensive security review..."
  }
}
```

### The Complete Flow

```
Main Agent                                    SDK/Runtime
    │                                              │
    │  1. tool_use: Task                          │
    │     subagent_type: "security-reviewer"      │
    │     prompt: "Review these files..."         │
    │────────────────────────────────────────────>│
    │                                              │
    │                         2. SDK looks up "security-reviewer"
    │                            in your agents config
    │                                              │
    │                         3. SDK spawns subagent with:
    │                            - Your configured prompt (system)
    │                            - Main agent's prompt (user msg)
    │                            - Your configured model & tools
    │                                              │
    │                         4. Subagent runs autonomously
    │                            (can use tools, multiple turns)
    │                                              │
    │  5. tool_result returned                    │
    │     content: "## SECURITY REVIEW..."        │
    │<────────────────────────────────────────────│
```

### Task Tool is Overloaded

The Task tool serves dual purposes:

| Parameter | Purpose |
|-----------|---------|
| `subagent_type` present | Spawns one of YOUR defined subagents |
| `subagent_type` absent | Uses SDK's built-in agent types (Explore, Plan, etc.) |

### Detecting Subagent Calls in Code

In your message handler, you can detect subagent delegations:

```typescript
if (block.type === "tool_use" && block.name === "Task") {
  const input = block.input as any;
  if (input.subagent_type) {
    console.log(`Delegating to subagent: ${input.subagent_type}`);
    console.log(`Task prompt: ${input.prompt}`);
  }
}
```

### What Gets Returned

The subagent's final response comes back as a standard `tool_result`:

```typescript
{
  type: "tool_result",
  tool_use_id: "toolu_01ABC...",  // Matches the original tool_use
  content: [{"type":"text","text":"## SECURITY REVIEW REPORT\n..."}]
}
```

### Why This Design is Elegant

1. **Uniform Interface**: Subagents use the same tool_use/tool_result pattern as everything else

2. **Composable**: Main agent can mix regular tool calls with subagent delegations seamlessly

3. **Transparent**: You can log/intercept subagent calls just like any other tool (useful for Hooks!)

4. **Familiar**: If you understand tool calling, you understand subagent spawning

5. **No Special Primitives**: The SDK doesn't need new message types or protocols

## Deep Dive: Subagent Prompting

Understanding exactly what context subagents receive is crucial for designing effective multi-agent systems.

### Two-Part Prompting

Subagents receive TWO pieces of context:

1. **Your configured `prompt`** → becomes the **system instructions**
2. **Main agent's Task tool `prompt`** → becomes the **user message/task**

```
┌─────────────────────────────────────────────────────────────────┐
│                        SUBAGENT CONTEXT                         │
├─────────────────────────────────────────────────────────────────┤
│ SYSTEM PROMPT (from your agents config):                        │
│ "You are a security expert performing a code security review.   │
│  FOCUS AREAS: - Input validation and sanitization..."           │
├─────────────────────────────────────────────────────────────────┤
│ USER MESSAGE (composed by main agent via Task tool):            │
│ "Please perform a comprehensive security review of all code     │
│  files in the './examples/01-basic-agent' directory..."         │
└─────────────────────────────────────────────────────────────────┘
```

### Main Agent Adds Context

The main agent doesn't just forward your request—it **composes a specific task description**. In our run, the main agent wrote:

```
"Please perform a comprehensive security review of all code files
in the './examples/01-basic-agent' directory..."
```

This task prompt was NOT in our code. The main agent:
- Identified the specific directory to analyze
- Framed the task for the specialist
- Added any relevant context from the original request

### Implications for Prompt Design

| Your `prompt` Config | Main Agent's Task Prompt |
|---------------------|-------------------------|
| Define the persona and expertise | Specifies the concrete task |
| Set focus areas and methodology | Provides file paths and scope |
| Establish output format guidelines | Adds context from user request |
| Remains constant across invocations | Changes based on each delegation |

**Best Practice**: Keep your `prompt` config focused on WHO the subagent is and HOW it should work. Let the main agent fill in WHAT specific task to do.

## Deep Dive: Output & Handoff

### How Subagent Results Return

Subagent responses come back as standard Claude API format:

```json
[{"type":"text","text":"## SECURITY REVIEW REPORT\n\n### Files Analyzed:\n..."}]
```

This is:
- An array of content blocks
- The `"text"` field contains the subagent's response
- Plain text/markdown, NOT structured JSON

### Output Format Guidelines vs. Structured Output

Our prompt included:
```
OUTPUT FORMAT:
For each issue found, report:
- Severity: CRITICAL, HIGH, MEDIUM, or LOW
- File and line number
- Description of the vulnerability
```

This is **guidance for text formatting**, not actual JSON structure. The subagent followed it by writing:

```markdown
## SECURITY REVIEW REPORT

### Issues Found:

**Severity:** CRITICAL
**File:** max-turns-demo.ts (Lines 20, 27-29)
**Description:** Unrestricted Bash Command Execution...
```

### If You Need Actual Structured JSON

For programmatic parsing, you'd need:
1. **Structured Output** (Module 5) with JSON schemas
2. Or parse the markdown text yourself
3. Or add explicit JSON formatting instructions and hope for compliance

### What the Main Agent Receives

The main agent receives the full text response (~10-12K chars each in our case). It then:
1. Reads all subagent reports
2. Extracts key findings
3. Synthesizes into a unified summary
4. Adds its own analysis and prioritization

## Best Practices

### 1. Clear Descriptions
Make `description` crystal clear - this is what the main agent uses to decide when to delegate:

```typescript
// ✅ Good - specific and actionable
description: "Security specialist that analyzes code for injection vulnerabilities, auth issues, and data exposure"

// ❌ Bad - vague
description: "Helps with security stuff"
```

### 2. Focused Prompts
Each subagent prompt should be laser-focused on its specialty:

```typescript
prompt: `You are a security expert performing a code security review.

FOCUS AREAS:
- Input validation and sanitization
- Injection vulnerabilities (SQL, command, XSS)
- Authentication and authorization issues
...

OUTPUT FORMAT:
For each issue found, report:
- Severity: CRITICAL, HIGH, MEDIUM, or LOW
- File and line number
...`
```

### 3. Right-Size the Model
Match model capability to task complexity:

| Task Type | Recommended Model |
|-----------|-------------------|
| Security analysis | `sonnet` (needs nuance) |
| Simple pattern matching | `haiku` (fast, cheap) |
| Complex architecture review | `opus` (highest capability) |

### 4. Appropriate Tool Selection
Only give subagents the tools they need:

```typescript
// Security reviewer needs to search and read code
tools: ["Read", "Grep", "Glob"]

// Docs checker just needs to read files
tools: ["Read", "Glob"]
```

## Example Use Cases

| Subagent | Purpose | Model |
|----------|---------|-------|
| Security Reviewer | Find vulnerabilities | sonnet |
| Performance Analyst | Spot inefficiencies | haiku |
| Test Writer | Generate test cases | sonnet |
| Docs Generator | Write documentation | haiku |
| Code Migrator | Convert code patterns | sonnet |
| Dependency Checker | Audit packages | haiku |

## Observations from Running the Example

When we ran our code review system against `examples/01-basic-agent`:

### What Happened

1. **Main agent analyzed the task** and decided to delegate to all 3 specialists
2. **Subagents were called via the Task tool** with `subagent_type` set to the agent name
3. **Each subagent worked independently** - reading files, grepping for patterns, etc.
4. **The main agent synthesized results** into a comprehensive code review

### Results

| Metric | Value |
|--------|-------|
| Total Turns | 38 |
| Total Cost | $0.52 |
| Security Issues Found | 3 Critical, 2 High |
| Performance Issues Found | 2 Medium |
| Documentation Score | 8/10 |

### Interesting Observations

1. **Sequential Delegation**: Despite our hope for parallel execution, the main agent called subagents one at a time (turns 1, 2, 3). This is current SDK behavior - true parallelism may require explicit configuration.

2. **Tool Access**: The `tools` property in subagent configuration doesn't appear to restrict tool access (we saw all tools listed). This is similar to the `allowedTools` issue noted in the basic-agent learnings.

3. **Excellent Synthesis**: The main agent did an excellent job combining findings from all specialists into a prioritized, actionable report with role-specific recommendations.

4. **Cost Effectiveness**: Using `haiku` for simpler tasks (performance, docs) and `sonnet` for complex analysis (security) helped optimize costs while maintaining quality.

### Known Limitations (Current SDK Version)

- `tools` property may not strictly restrict subagent tool access
- Subagent delegation appears sequential, not truly parallel
- Each subagent call is a separate Task tool invocation (adds overhead)

## Token Economics: Subagents vs. Single Agent

One of the most important considerations when using subagents is understanding the token and cost tradeoffs.

### Our Code Review Example

**Source material analyzed:** ~16.5K chars (~4,100 tokens)
- `index.ts`: 5,495 chars
- `max-turns-demo.ts`: 2,804 chars
- `learnings.md`: 8,230 chars

### Architecture Comparison

**With Subagents:**
```
┌─────────────────────────────────────────────────────────────┐
│                      MAIN AGENT                             │
│  Receives subagent reports (~8,500 tokens)                  │
│  Synthesizes into final output (~4,000 tokens)              │
└─────────────────────────────────────────────────────────────┘
         ▲              ▲                ▲
         │              │                │
    ┌────┴────┐    ┌────┴────┐    ┌──────┴──────┐
    │Subagent │    │Subagent │    │  Subagent   │
    │  #1     │    │   #2    │    │     #3      │
    │~7K ctx  │    │~7K ctx  │    │  ~7K ctx    │
    └─────────┘    └─────────┘    └─────────────┘
```

**Without Subagents:**
- Single agent loads files once (~4,100 tokens)
- Combined system prompt for all domains (~1,200 tokens)
- Generates comprehensive report (~12,000 tokens)

### Token Comparison

| Metric | WITH Subagents | WITHOUT Subagents |
|--------|----------------|-------------------|
| **Total Input Tokens** | ~22,200 | ~5,300 |
| **Total Output Tokens** | ~12,400 | ~12,000 |
| **Peak Context per Agent** | ~12,700 | ~17,300 |

### The Cost Equation: It Depends on Model Mix!

Raw token count isn't the full story—**model pricing** changes everything.

**Scenario A: Same model everywhere (all Sonnet)**
- Subagents cost MORE (3× the file processing)
- Single agent wins on cost

**Scenario B: Opus coordinator + Haiku workers**
```
Main Agent (Opus):     ~12,700 tokens × $15/$75 per M = expensive but small
Subagents (Haiku):     ~21,000 tokens × $0.25/$1.25 per M = very cheap
```
- Subagents can cost LESS because bulk work uses cheap models
- You get Opus-quality synthesis with Haiku-priced analysis

**Approximate Pricing (per 1M tokens):**
| Model | Input | Output |
|-------|-------|--------|
| Opus | $15 | $75 |
| Sonnet | $3 | $15 |
| Haiku | $0.25 | $1.25 |

### When Subagents Save Money

Subagents are cost-effective when:
1. **Main agent uses expensive model** (Opus) for coordination/synthesis
2. **Subagents use cheap models** (Haiku) for bulk analysis
3. **Tasks are parallelizable** - offload volume to cheaper workers

### When Single Agent is Cheaper

Single agent wins when:
1. **Using same model** for everything anyway
2. **Small codebase** - not much to parallelize
3. **Simple task** - doesn't need specialist depth

### The Real Subagent Value

Beyond cost, subagents provide:

| Benefit | Description |
|---------|-------------|
| **Quality** | Focused prompts → deeper specialist analysis |
| **Scalability** | Avoids context limits on large codebases |
| **Model Flexibility** | Right-size model to task complexity |
| **Separation of Concerns** | Clean architecture, easier to maintain |

## Key Takeaways

1. **Subagents = Specialists**: Define focused experts for specific domains
2. **Main Agent = Coordinator**: Delegates and synthesizes results
3. **Cost-Effective**: Use cheaper models for subagent work, expensive models for coordination
4. **Clear Contracts**: Good descriptions help the main agent delegate correctly
5. **Focused Prompts**: Each subagent should be an expert in its narrow domain
6. **Synthesis is Key**: The main agent's ability to combine specialist findings adds significant value
7. **Model Mix Matters**: Opus + Haiku subagents can be cheaper than Sonnet everywhere
