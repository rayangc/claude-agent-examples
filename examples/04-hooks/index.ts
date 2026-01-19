/**
 * Hooks Example
 *
 * This example demonstrates how to use hooks in the Claude Agent SDK to:
 * - Log all tool usage to an audit trail (PostToolUse)
 * - Block dangerous bash commands (PreToolUse)
 * - Track tool execution timing
 * - Apply matchers to target specific tools
 */

import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";

// ============================================================================
// AUDIT TRAIL SYSTEM
// Tracks all tool calls with timestamps and results
// ============================================================================

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
const toolStartTimes: Map<string, number> = new Map();

function formatTimestamp(): string {
  return new Date().toISOString().split("T")[1].slice(0, 12);
}

function addAuditEntry(entry: AuditEntry): void {
  auditTrail.push(entry);
}

// ============================================================================
// DANGEROUS COMMAND PATTERNS
// Commands that should be blocked for safety
// ============================================================================

const DANGEROUS_PATTERNS = [
  // Destructive file operations
  { pattern: /rm\s+(-[rf]+\s+)*\//, description: "rm with absolute path" },
  { pattern: /rm\s+-rf\s+/, description: "rm -rf (recursive force delete)" },
  { pattern: /rmdir\s+\//, description: "rmdir with absolute path" },

  // System modification
  { pattern: /chmod\s+777/, description: "chmod 777 (insecure permissions)" },
  { pattern: /mkfs\./, description: "mkfs (format filesystem)" },
  { pattern: /dd\s+if=.*of=\/dev\//, description: "dd to device" },

  // Network exfiltration
  { pattern: /curl.*\|\s*sh/, description: "curl pipe to shell" },
  { pattern: /wget.*\|\s*sh/, description: "wget pipe to shell" },

  // Credential access
  { pattern: /cat\s+.*\.ssh\//, description: "reading SSH keys" },
  { pattern: /cat\s+.*\/etc\/passwd/, description: "reading passwd file" },
  { pattern: /cat\s+.*\/etc\/shadow/, description: "reading shadow file" },

  // Fork bombs and resource exhaustion
  { pattern: /:\(\)\s*\{.*\}/, description: "fork bomb" },
  { pattern: />\s*\/dev\/sd[a-z]/, description: "writing to raw device" },
];

function checkDangerousCommand(command: string): { blocked: boolean; reason?: string } {
  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { blocked: true, reason: description };
    }
  }
  return { blocked: false };
}

// ============================================================================
// HOOK CALLBACKS
// Functions that intercept tool execution
// ============================================================================

/**
 * PreToolUse Hook: Runs BEFORE each tool executes
 *
 * Use cases:
 * - Block dangerous operations
 * - Validate inputs
 * - Require confirmation
 * - Log intent
 */
const preToolUseHook: HookCallback = async (input, toolUseId) => {
  const timestamp = formatTimestamp();
  const toolName = input.tool_name;

  console.log(`\n  ⏳ [${timestamp}] PRE: ${toolName} (${toolUseId.slice(0, 8)}...)`);

  // Record start time for duration tracking
  toolStartTimes.set(toolUseId, Date.now());

  // Check Bash commands for dangerous patterns
  if (toolName === "Bash" && input.tool_input?.command) {
    const command = input.tool_input.command as string;
    const { blocked, reason } = checkDangerousCommand(command);

    if (blocked) {
      console.log(`  🚫 BLOCKED: ${reason}`);
      console.log(`     Command: ${command.slice(0, 60)}...`);

      addAuditEntry({
        timestamp,
        toolName,
        toolUseId,
        phase: "pre",
        input: { command: command.slice(0, 100) },
        blocked: true,
        blockReason: reason,
      });

      // Return denial to prevent tool execution
      return {
        hookSpecificOutput: {
          permissionDecision: "deny",
          permissionDecisionReason: `Blocked dangerous command: ${reason}`,
        },
      };
    }

    // Log allowed commands
    console.log(`  📝 Command: ${command.slice(0, 60)}${command.length > 60 ? "..." : ""}`);
  }

  // Log other tool inputs (abbreviated)
  if (toolName !== "Bash" && input.tool_input) {
    const inputStr = JSON.stringify(input.tool_input);
    console.log(`  📝 Input: ${inputStr.slice(0, 80)}${inputStr.length > 80 ? "..." : ""}`);
  }

  addAuditEntry({
    timestamp,
    toolName,
    toolUseId,
    phase: "pre",
    input: input.tool_input as Record<string, unknown>,
  });

  // Return empty object to allow the operation
  return {};
};

/**
 * PostToolUse Hook: Runs AFTER each tool completes
 *
 * Use cases:
 * - Log results
 * - Track execution time
 * - Collect metrics
 * - Transform output
 */
const postToolUseHook: HookCallback = async (input, toolUseId) => {
  const timestamp = formatTimestamp();
  const toolName = input.tool_name;

  // Calculate execution duration
  const startTime = toolStartTimes.get(toolUseId);
  const duration = startTime ? Date.now() - startTime : undefined;
  toolStartTimes.delete(toolUseId);

  console.log(`  ✅ [${timestamp}] POST: ${toolName} (${duration}ms)`);

  addAuditEntry({
    timestamp,
    toolName,
    toolUseId,
    phase: "post",
    duration,
  });

  return {};
};

/**
 * File Write Hook: Special handling for file modifications
 *
 * Demonstrates matcher-specific hooks - only fires for Write and Edit tools
 */
const fileWriteHook: HookCallback = async (input, toolUseId) => {
  const toolName = input.tool_name;
  const filePath = input.tool_input?.file_path as string;

  if (filePath) {
    console.log(`  📁 File operation: ${toolName} → ${filePath}`);

    // Could add additional checks here:
    // - Block writes to certain directories
    // - Require confirmation for config files
    // - Validate file content
  }

  return {};
};

// ============================================================================
// MAIN AGENT RUNNER
// ============================================================================

async function main() {
  console.log("\n🔒 Security-Focused Agent with Hooks");
  console.log("─".repeat(60));
  console.log("\nThis example demonstrates:");
  console.log("  • PreToolUse hooks - intercept before execution");
  console.log("  • PostToolUse hooks - track after completion");
  console.log("  • Matchers - target specific tools");
  console.log("  • Blocking dangerous commands");
  console.log("  • Audit trail generation");
  console.log("\n" + "─".repeat(60));

  let turnCount = 0;

  // Run the agent with hooks configured
  for await (const message of query({
    prompt: `Please do the following tasks to demonstrate hooks:

1. First, use the Read tool to read the file at "./package.json"
2. Then, use Glob to find all TypeScript files in "./examples"
3. Run a safe bash command: "echo 'Hello from hooks example!'"
4. Try to run this dangerous command (it should be blocked): "rm -rf /"
5. Finally, create a small test file at "./examples/04-hooks/test-output.txt" with the content "Hook test successful!"

After each task, briefly note whether it succeeded or was blocked.`,

    options: {
      model: "sonnet",
      maxTurns: 15,
      permissionMode: "bypassPermissions",

      // Configure hooks to intercept tool execution
      hooks: {
        // PreToolUse hooks run before EVERY tool by default
        PreToolUse: [
          // Global hook - runs for all tools
          { hooks: [preToolUseHook] },

          // Matcher hook - only runs for Write and Edit tools
          // The matcher is a regex pattern matched against tool names
          { matcher: "Write|Edit", hooks: [fileWriteHook] },
        ],

        // PostToolUse hooks run after tools complete
        PostToolUse: [{ hooks: [postToolUseHook] }],
      },

      // Only allow specific tools for this demo
      allowedTools: ["Read", "Write", "Edit", "Glob", "Bash"],
    },
  })) {
    switch (message.type) {
      case "system":
        console.log(`\n📦 Session: ${message.session_id}`);
        console.log(`   Tools: ${message.tools.join(", ")}`);
        break;

      case "assistant":
        if (message.message.content) {
          const toolCalls = message.message.content.filter(
            (block: any) => block.type === "tool_use"
          );

          if (toolCalls.length > 0) {
            turnCount++;
            console.log(`\n${"═".repeat(60)}`);
            console.log(`🔄 TURN ${turnCount}`);
            console.log(`${"═".repeat(60)}`);
          }

          for (const block of message.message.content) {
            if (block.type === "text") {
              console.log(`\n💬 ${block.text}`);
            } else if (block.type === "tool_use") {
              console.log(`\n🔧 Tool: ${block.name}`);
            }
          }
        }
        break;

      case "user":
        // Tool results are shown via hooks, minimal display here
        break;

      case "result":
        console.log("\n" + "═".repeat(60));
        console.log("📊 EXECUTION COMPLETE");
        console.log("═".repeat(60));

        if (message.subtype === "success") {
          console.log(`✅ Status: ${message.subtype}`);
          console.log(`🔄 Turns: ${turnCount}`);
          console.log(`💰 Cost: $${message.total_cost_usd.toFixed(4)}`);
        } else {
          console.log(`⚠️  Status: ${message.subtype}`);
        }

        // Print the audit trail summary
        console.log("\n" + "─".repeat(60));
        console.log("📋 AUDIT TRAIL SUMMARY");
        console.log("─".repeat(60));

        const toolCounts = new Map<string, number>();
        let blockedCount = 0;
        let totalDuration = 0;

        for (const entry of auditTrail) {
          if (entry.phase === "post") {
            toolCounts.set(entry.toolName, (toolCounts.get(entry.toolName) || 0) + 1);
            if (entry.duration) totalDuration += entry.duration;
          }
          if (entry.blocked) blockedCount++;
        }

        console.log("\nTool Usage:");
        for (const [tool, count] of toolCounts) {
          console.log(`  • ${tool}: ${count} call(s)`);
        }

        console.log(`\nBlocked Operations: ${blockedCount}`);
        console.log(`Total Execution Time: ${totalDuration}ms`);

        // Show blocked commands detail
        const blockedEntries = auditTrail.filter((e) => e.blocked);
        if (blockedEntries.length > 0) {
          console.log("\n🚫 Blocked Commands:");
          for (const entry of blockedEntries) {
            console.log(`  • ${entry.blockReason}`);
            if (entry.input?.command) {
              console.log(`    Command: ${String(entry.input.command).slice(0, 50)}...`);
            }
          }
        }

        break;
    }
  }
}

main().catch(console.error);
