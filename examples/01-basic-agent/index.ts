/**
 * Basic Agent Example
 *
 * This example demonstrates the fundamental pattern for using the Claude Agent SDK:
 * - Using the query() function to create an agent
 * - Streaming messages with async generators
 * - Using built-in tools (Glob, Read)
 * - Handling different message types
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  const targetDirectory = process.argv[2] || ".";

  console.log(`\n🔍 File Explorer Agent`);
  console.log(`Exploring: ${targetDirectory}\n`);
  console.log("─".repeat(50));

  // Track the agent loop turns
  let turnCount = 0;
  let hasToolCalls = false;

  // The query() function returns an async generator that yields messages
  // as the agent thinks, uses tools, and responds
  for await (const message of query({
    prompt: `Explore the directory "${targetDirectory}" and give me a summary of what you find.
             List the main files and folders, and if there are any code files,
             briefly describe what they seem to do.`,
    options: {
      // Model options: "opus", "sonnet", or "haiku"
      model: "sonnet",

      // Only allow specific tools - this limits what the agent can do
      allowedTools: ["Glob", "Read"],

      // Maximum number of tool-use turns before stopping
      maxTurns: 10,

      // Permission mode controls how tool usage is approved
      // "default" - prompts for approval
      // "acceptEdits" - auto-approves file modifications
      // "bypassPermissions" - no confirmation required
      permissionMode: "bypassPermissions",
    },
  })) {
    // Handle different message types
    switch (message.type) {
      case "system":
        // System messages contain session info and available tools
        console.log(`Session started: ${message.session_id}`);
        console.log(`Available tools: ${message.tools.join(", ")}\n`);
        break;

      case "assistant":
        // Assistant messages contain Claude's responses and tool calls
        if (message.message.content) {
          // Check if this message has any tool calls
          const toolCalls = message.message.content.filter(
            (block: any) => block.type === "tool_use"
          );

          // If there are tool calls, this is a new turn in the agent loop
          if (toolCalls.length > 0) {
            turnCount++;
            hasToolCalls = true;
            console.log(`\n${"═".repeat(50)}`);
            console.log(`🔄 TURN ${turnCount} - Agent invoking ${toolCalls.length} tool(s)`);
            console.log(`${"═".repeat(50)}`);
          }

          for (const block of message.message.content) {
            if (block.type === "text") {
              // This is Claude's text response (thinking or final answer)
              const label = hasToolCalls ? "💭 Thinking:" : "💬 Response:";
              console.log(`\n${label}\n${block.text}`);
            } else if (block.type === "tool_use") {
              // This is a tool invocation
              // block.id - unique identifier for this tool call
              // block.name - the tool being called (e.g., "Read", "Glob")
              // block.input - the arguments passed to the tool
              console.log(`\n🔧 Using tool: ${block.name}`);
              console.log(`   ID: ${block.id}`);
              console.log(`   Input: ${JSON.stringify(block.input, null, 2).split('\n').join('\n   ')}`);
            }
          }
        }
        break;

      case "user":
        // User messages contain tool results (the output from tools that were called)
        // This marks the end of tool execution for this turn
        console.log(`\n📥 Tool results received:`);
        if (message.message.content) {
          for (const block of message.message.content) {
            if (block.type === "tool_result") {
              // block.tool_use_id - matches the block.id from the tool_use
              // block.content - the result returned by the tool (can be string or array)
              // block.is_error - true if the tool failed
              const resultPreview = typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);

              // Truncate long results for readability
              const maxLength = 200;
              const truncated = resultPreview.length > maxLength
                ? resultPreview.slice(0, maxLength) + "... (truncated)"
                : resultPreview;

              const status = block.is_error ? "❌" : "✅";
              console.log(`\n   ${status} Result for ${block.tool_use_id}:`);
              console.log(`      ${truncated.split('\n').join('\n      ')}`);
            }
          }
        }
        break;

      case "result":
        // Result messages indicate completion
        console.log("\n" + "═".repeat(50));
        console.log("📊 AGENT LOOP COMPLETE");
        console.log("═".repeat(50));
        if (message.subtype === "success") {
          console.log(`✅ Status: Completed successfully`);
          console.log(`🔄 Total turns: ${turnCount}`);
          console.log(`💰 Cost: $${message.total_cost_usd.toFixed(4)}`);
          console.log(`📊 Tokens: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`);
        } else {
          console.log(`❌ Agent stopped: ${message.subtype}`);
          console.log(`🔄 Turns completed: ${turnCount}`);
        }
        break;
    }
  }
}

main().catch(console.error);
