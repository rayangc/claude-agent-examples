/**
 * Demo: What happens when maxTurns is reached
 *
 * This example uses a very low maxTurns (2) to show what happens
 * when the agent is cut off mid-task.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  console.log(`\n⚠️  Max Turns Demo (maxTurns = 2)`);
  console.log(`This will cut off the agent early!\n`);
  console.log("─".repeat(50));

  let turnCount = 0;

  for await (const message of query({
    // A prompt that requires many turns - forces tool usage
    prompt: `You MUST use tools to complete this task. Do NOT answer without using tools.
             1. First, use Bash to run "ls -la" to list files
             2. Then read package.json
             3. Then read tsconfig.json
             4. Then list the examples directory
             5. Then read each file in examples
             6. Finally summarize everything you found`,
    options: {
      model: "sonnet", // Using sonnet
      maxTurns: 2,    // Very low - will get cut off!
      permissionMode: "bypassPermissions",
    },
  })) {
    switch (message.type) {
      case "system":
        console.log(`Session started\n`);
        break;

      case "assistant":
        if (message.message.content) {
          const toolCalls = message.message.content.filter(
            (block: any) => block.type === "tool_use"
          );
          if (toolCalls.length > 0) {
            turnCount++;
            console.log(`\n🔄 TURN ${turnCount}/2`);
            for (const block of message.message.content) {
              if (block.type === "tool_use") {
                console.log(`   🔧 ${block.name}`);
              }
            }
          }
        }
        break;

      case "user":
        console.log(`   📥 Results received`);
        break;

      case "result":
        console.log("\n" + "═".repeat(50));
        console.log(`📊 RESULT`);
        console.log("═".repeat(50));
        console.log(`Status: ${message.subtype}`);
        console.log(`Turns used: ${turnCount}`);

        if (message.subtype === "error_max_turns" || message.subtype === "maxTurns") {
          console.log(`\n⚠️  Agent was CUT OFF!`);
          console.log(`   It wanted to do more but hit the limit.`);
          console.log(`   The task is INCOMPLETE - steps 2-6 never happened!`);
          console.log(`\n   💡 Solutions:`);
          console.log(`      - Increase maxTurns`);
          console.log(`      - Make the prompt more focused`);
          console.log(`      - Break into smaller tasks`);
        } else if (message.subtype === "success") {
          console.log(`\n✅ Agent finished naturally`);
        } else {
          console.log(`\n❓ Other status: ${message.subtype}`);
        }
        break;
    }
  }
}

main().catch(console.error);
