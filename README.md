# Claude Agent SDK Examples

A hands-on learning project exploring the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) concepts through focused, runnable examples.

## What's This?

This repo contains examples that demonstrate core concepts of the Claude Agent SDK:

| Module | Status | Concepts |
|--------|--------|----------|
| [01-basic-agent](./examples/01-basic-agent/) | ✅ Complete | query(), message types, agent loop, tool calls |
| [02-subagents](./examples/02-subagents/) | 🚧 In Progress | Delegating to specialized agents |
| [03-custom-tools](./examples/03-custom-tools/) | 📋 Planned | MCP, creating your own tools |
| [04-hooks](./examples/04-hooks/) | 📋 Planned | Intercepting tool usage, guardrails |
| [05-structured-output](./examples/05-structured-output/) | 📋 Planned | JSON Schema validation |

## Getting Started

```bash
# Install dependencies
npm install

# Set your Anthropic API key
export ANTHROPIC_API_KEY=your-key-here

# Run an example
npm run basic
```

## Running Examples

```bash
npm run basic        # Basic agent - file explorer
npm run subagents    # Subagents - delegating tasks
npm run custom-tools # Custom tools with MCP
npm run hooks        # Hooks for guardrails
```

## Learning Path

Each example folder contains:
- `index.ts` - The runnable example code
- `learnings.md` - Key concepts and takeaways

Start with `01-basic-agent` and work through sequentially. See [plan.md](./plan.md) for the full learning roadmap.

## Source Material

Based on: https://gist.github.com/dabit3/93a5afe8171753d0dbfd41c80033171d

## License

MIT
