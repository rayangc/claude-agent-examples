/**
 * Subagents Example - Code Review System
 *
 * This example demonstrates how to use subagents in the Claude Agent SDK:
 * - Defining multiple specialized subagents
 * - Each subagent has its own role, tools, and model
 * - The main agent coordinates and delegates to appropriate subagents
 *
 * Our code review system has three specialists:
 * 1. Security Reviewer - Finds security vulnerabilities
 * 2. Performance Analyst - Identifies performance issues
 * 3. Documentation Checker - Ensures code is well-documented
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  const targetPath = process.argv[2] || "./examples/01-basic-agent";

  console.log(`\n🔍 Code Review System with Subagents`);
  console.log(`Reviewing: ${targetPath}\n`);
  console.log("═".repeat(60));
  console.log("This system uses 3 specialized subagents:");
  console.log("  🛡️  Security Reviewer - finds vulnerabilities");
  console.log("  ⚡ Performance Analyst - spots inefficiencies");
  console.log("  📚 Documentation Checker - ensures good docs");
  console.log("═".repeat(60));

  let turnCount = 0;

  for await (const message of query({
    prompt: `Please perform a comprehensive code review of the files in "${targetPath}".

I want you to delegate to the specialized subagents:
1. Use the security-reviewer to check for security issues
2. Use the performance-analyst to find performance problems
3. Use the docs-checker to evaluate documentation quality

After all reviews are complete, synthesize the findings into a final summary
with prioritized recommendations.`,

    options: {
      // Main agent uses a capable model to coordinate
      model: "sonnet",

      // Tools available to the main agent
      allowedTools: ["Glob", "Read", "Task"],

      maxTurns: 15,
      permissionMode: "bypassPermissions",

      // ═══════════════════════════════════════════════════════════════
      // SUBAGENT DEFINITIONS
      // ═══════════════════════════════════════════════════════════════
      // Each subagent is a specialized assistant with its own:
      // - description: Tells the main agent what this subagent does
      // - prompt: System instructions that shape the subagent's behavior
      // - tools: The specific tools this subagent can use
      // - model: Which Claude model to use (allows cost optimization)
      // ═══════════════════════════════════════════════════════════════
      agents: {
        // ─────────────────────────────────────────────────────────────
        // Security Reviewer Subagent
        // ─────────────────────────────────────────────────────────────
        "security-reviewer": {
          description: "Security specialist that analyzes code for vulnerabilities, injection risks, and security best practices",

          prompt: `You are a security expert performing a code security review.

FOCUS AREAS:
- Input validation and sanitization
- Injection vulnerabilities (SQL, command, XSS)
- Authentication and authorization issues
- Sensitive data exposure (API keys, passwords in code)
- Insecure dependencies or imports
- Race conditions and TOCTOU vulnerabilities

OUTPUT FORMAT:
For each issue found, report:
- Severity: CRITICAL, HIGH, MEDIUM, or LOW
- File and line number
- Description of the vulnerability
- Recommended fix

If no security issues are found, explicitly state that the code passed security review.`,

          tools: ["Read", "Grep", "Glob"],

          // Use a capable model for security analysis
          model: "sonnet",
        },

        // ─────────────────────────────────────────────────────────────
        // Performance Analyst Subagent
        // ─────────────────────────────────────────────────────────────
        "performance-analyst": {
          description: "Performance specialist that identifies inefficiencies, memory issues, and optimization opportunities",

          prompt: `You are a performance expert analyzing code for efficiency issues.

FOCUS AREAS:
- Unnecessary loops or iterations
- Memory leaks or excessive allocations
- Blocking operations that could be async
- Missing caching opportunities
- N+1 query patterns
- Inefficient data structures
- Redundant computations

OUTPUT FORMAT:
For each issue found, report:
- Impact: HIGH, MEDIUM, or LOW
- File and location
- Description of the inefficiency
- Suggested optimization

If no significant performance issues are found, note any minor improvements or confirm the code is well-optimized.`,

          tools: ["Read", "Grep", "Glob"],

          // Use a faster, cheaper model for performance analysis
          model: "haiku",
        },

        // ─────────────────────────────────────────────────────────────
        // Documentation Checker Subagent
        // ─────────────────────────────────────────────────────────────
        "docs-checker": {
          description: "Documentation specialist that evaluates code comments, JSDoc/TSDoc, and overall code clarity",

          prompt: `You are a documentation expert reviewing code documentation quality.

FOCUS AREAS:
- Function and class documentation (JSDoc/TSDoc)
- Inline comments for complex logic
- README and usage documentation
- Type annotations and interfaces
- Code self-documentation (clear naming)
- Missing documentation for public APIs

OUTPUT FORMAT:
Rate the documentation on a scale of 1-10, then list:
- Missing documentation (where docs are needed)
- Unclear documentation (where docs exist but need improvement)
- Good examples (well-documented sections worth noting)

Provide specific suggestions for improvement.`,

          tools: ["Read", "Glob"],

          // Documentation checks can use the fastest model
          model: "haiku",
        },
      },
    },
  })) {
    switch (message.type) {
      case "system":
        console.log(`\n📋 Session: ${message.session_id}`);
        console.log(`🔧 Main agent tools: ${message.tools.join(", ")}`);
        console.log(`🤖 Subagents available: security-reviewer, performance-analyst, docs-checker\n`);
        break;

      case "assistant":
        if (message.message.content) {
          const toolCalls = message.message.content.filter(
            (block: any) => block.type === "tool_use"
          );

          if (toolCalls.length > 0) {
            turnCount++;
            console.log(`\n${"─".repeat(60)}`);
            console.log(`🔄 TURN ${turnCount}`);
            console.log(`${"─".repeat(60)}`);
          }

          for (const block of message.message.content) {
            if (block.type === "text") {
              console.log(`\n💬 ${block.text}`);
            } else if (block.type === "tool_use") {
              // Check if this is a Task tool call (subagent delegation)
              if (block.name === "Task") {
                const input = block.input as any;
                console.log(`\n🤖 Delegating to subagent: ${input.subagent_type}`);
                console.log(`   Task: ${input.description}`);
                console.log(`   Prompt: ${input.prompt?.slice(0, 100)}...`);
              } else {
                console.log(`\n🔧 Tool: ${block.name}`);
                console.log(`   Input: ${JSON.stringify(block.input).slice(0, 100)}...`);
              }
            }
          }
        }
        break;

      case "user":
        // Tool results - including subagent responses
        if (message.message.content) {
          for (const block of message.message.content) {
            if (block.type === "tool_result") {
              const content = typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);

              // Show a preview of the result
              const preview = content.length > 300
                ? content.slice(0, 300) + "...(truncated)"
                : content;

              console.log(`\n📥 Result received (${content.length} chars)`);
              console.log(`   ${preview.split("\n").slice(0, 5).join("\n   ")}`);
            }
          }
        }
        break;

      case "result":
        console.log("\n" + "═".repeat(60));
        console.log("📊 CODE REVIEW COMPLETE");
        console.log("═".repeat(60));

        if (message.subtype === "success") {
          console.log(`✅ Status: Completed successfully`);
          console.log(`🔄 Total turns: ${turnCount}`);
          console.log(`💰 Total cost: $${message.total_cost_usd.toFixed(4)}`);
          console.log(`📊 Tokens: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`);
        } else {
          console.log(`⚠️  Status: ${message.subtype}`);
          if (message.subtype === "error_max_turns") {
            console.log(`   Review was cut short due to turn limit`);
          }
        }
        break;
    }
  }
}

main().catch(console.error);
