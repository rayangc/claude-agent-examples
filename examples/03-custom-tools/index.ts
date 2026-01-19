/**
 * Custom Tools (MCP) Example
 *
 * This example demonstrates how to extend the Claude Agent SDK with custom tools
 * using the Model Context Protocol (MCP):
 * - Creating an MCP server with createSdkMcpServer
 * - Defining tools with the tool() helper
 * - Using Zod for input schema validation
 * - Registering custom tools with the agent
 * - Combining custom tools with built-in tools
 */

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TOOL IMPLEMENTATIONS
// These are the actual functions that do the work
// ============================================================================

/**
 * Count lines of code in a file
 * Returns total lines, code lines, comment lines, and blank lines
 */
function countLines(filePath: string): {
  total: number;
  code: number;
  comments: number;
  blank: number;
} {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  let code = 0;
  let comments = 0;
  let blank = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      blank++;
      continue;
    }

    // Handle block comments
    if (inBlockComment) {
      comments++;
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    // Start of block comment
    if (trimmed.startsWith("/*")) {
      comments++;
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    // Single-line comment
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
      comments++;
      continue;
    }

    code++;
  }

  return {
    total: lines.length,
    code,
    comments,
    blank,
  };
}

/**
 * Calculate simplified cyclomatic complexity
 * Counts decision points: if, else, for, while, switch, case, catch, &&, ||, ?:
 */
function calculateComplexity(filePath: string): {
  complexity: number;
  breakdown: Record<string, number>;
} {
  const content = fs.readFileSync(filePath, "utf-8");

  // Decision point patterns
  const patterns: Record<string, RegExp> = {
    if: /\bif\s*\(/g,
    else: /\belse\b/g,
    for: /\bfor\s*\(/g,
    while: /\bwhile\s*\(/g,
    switch: /\bswitch\s*\(/g,
    case: /\bcase\s+/g,
    catch: /\bcatch\s*\(/g,
    "&&": /&&/g,
    "||": /\|\|/g,
    "?:": /\?[^:]*:/g,
  };

  const breakdown: Record<string, number> = {};
  let complexity = 1; // Base complexity

  for (const [name, pattern] of Object.entries(patterns)) {
    const matches = content.match(pattern) || [];
    breakdown[name] = matches.length;
    complexity += matches.length;
  }

  return { complexity, breakdown };
}

/**
 * Find imports and dependencies in a file
 * Supports ES6 imports and CommonJS require
 */
function findDependencies(filePath: string): {
  imports: string[];
  requires: string[];
  localImports: string[];
  externalDeps: string[];
} {
  const content = fs.readFileSync(filePath, "utf-8");

  // ES6 imports: import X from "Y" or import { X } from "Y"
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

  // CommonJS requires: require("X")
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  const imports: string[] = [];
  const requires: string[] = [];

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  while ((match = requireRegex.exec(content)) !== null) {
    requires.push(match[1]);
  }

  // Categorize as local (starts with . or /) or external (npm packages)
  const allDeps = [...imports, ...requires];
  const localImports = allDeps.filter((d) => d.startsWith(".") || d.startsWith("/"));
  const externalDeps = allDeps.filter((d) => !d.startsWith(".") && !d.startsWith("/"));

  return {
    imports: [...new Set(imports)],
    requires: [...new Set(requires)],
    localImports: [...new Set(localImports)],
    externalDeps: [...new Set(externalDeps)],
  };
}

// ============================================================================
// MCP SERVER DEFINITION
// This is where we create custom tools using the Model Context Protocol
// ============================================================================

/**
 * Create an MCP server with our code metrics tools
 *
 * The createSdkMcpServer function takes:
 * - name: Server identifier (used in tool naming)
 * - version: Semantic version string
 * - tools: Array of tool definitions
 */
const metricsServer = createSdkMcpServer({
  name: "code-metrics",
  version: "1.0.0",
  tools: [
    // Tool 1: Count Lines of Code
    tool(
      "count_lines", // Tool name (becomes mcp__code-metrics__count_lines)
      "Count lines of code in a file. Returns total lines, code lines, comment lines, and blank lines.", // Description for Claude
      {
        // Zod schema defines input parameters
        filePath: z.string().describe("Absolute path to the file to analyze"),
      },
      async (args) => {
        // Handler function - receives validated args matching the schema
        try {
          const result = countLines(args.filePath);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    file: args.filePath,
                    metrics: result,
                    ratio: {
                      codePercent: ((result.code / result.total) * 100).toFixed(1),
                      commentPercent: ((result.comments / result.total) * 100).toFixed(1),
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    ),

    // Tool 2: Analyze Complexity
    tool(
      "analyze_complexity",
      "Calculate cyclomatic complexity of a file. Higher numbers indicate more complex code with more decision paths.",
      {
        filePath: z.string().describe("Absolute path to the file to analyze"),
      },
      async (args) => {
        try {
          const result = calculateComplexity(args.filePath);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    file: args.filePath,
                    cyclomaticComplexity: result.complexity,
                    breakdown: result.breakdown,
                    assessment:
                      result.complexity <= 10
                        ? "Low complexity - easy to understand and test"
                        : result.complexity <= 20
                          ? "Moderate complexity - consider simplifying"
                          : "High complexity - should be refactored",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    ),

    // Tool 3: Find Dependencies
    tool(
      "find_dependencies",
      "Analyze imports and dependencies in a file. Identifies ES6 imports, CommonJS requires, local vs external dependencies.",
      {
        filePath: z.string().describe("Absolute path to the file to analyze"),
      },
      async (args) => {
        try {
          const result = findDependencies(args.filePath);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    file: args.filePath,
                    summary: {
                      totalImports: result.imports.length,
                      totalRequires: result.requires.length,
                      localDependencies: result.localImports.length,
                      externalDependencies: result.externalDeps.length,
                    },
                    imports: result.imports,
                    requires: result.requires,
                    categorized: {
                      local: result.localImports,
                      external: result.externalDeps,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    ),
  ],
});

// ============================================================================
// MAIN AGENT RUNNER
// ============================================================================

async function main() {
  // Default to analyzing our own directory
  const targetDirectory =
    process.argv[2] || path.resolve(process.cwd(), "examples/01-basic-agent");

  console.log(`\n📊 Code Metrics Agent`);
  console.log(`Analyzing: ${targetDirectory}\n`);
  console.log("─".repeat(60));

  let turnCount = 0;

  // Run the agent with our custom MCP tools
  for await (const message of query({
    prompt: `Analyze the code files in "${targetDirectory}".

For each TypeScript file you find:
1. Use count_lines to get line counts
2. Use analyze_complexity to assess complexity
3. Use find_dependencies to list dependencies

Then provide a summary report with:
- Overview of files analyzed
- Total lines of code across all files
- Average complexity score
- Most complex file identified
- External dependencies used`,

    options: {
      model: "sonnet",
      maxTurns: 20,
      permissionMode: "bypassPermissions",

      // Register our custom MCP server
      // The server name becomes part of the tool names: mcp__<server>__<tool>
      mcpServers: {
        "code-metrics": metricsServer,
      },

      // Allow both built-in tools AND our custom tools
      // Custom tool format: mcp__<server-name>__<tool-name>
      allowedTools: [
        "Glob", // Built-in: find files by pattern
        "Read", // Built-in: read file contents
        "mcp__code-metrics__count_lines", // Custom: count lines
        "mcp__code-metrics__analyze_complexity", // Custom: complexity analysis
        "mcp__code-metrics__find_dependencies", // Custom: dependency analysis
      ],
    },
  })) {
    switch (message.type) {
      case "system":
        console.log(`Session: ${message.session_id}`);
        console.log(`\n📦 Available tools:`);
        // Separate built-in from custom tools for clarity
        const builtIn = message.tools.filter((t: string) => !t.startsWith("mcp__"));
        const custom = message.tools.filter((t: string) => t.startsWith("mcp__"));
        console.log(`   Built-in: ${builtIn.join(", ")}`);
        console.log(`   Custom:   ${custom.map((t: string) => t.replace("mcp__code-metrics__", "")).join(", ")}`);
        console.log("");
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
              // Highlight custom vs built-in tools
              const isCustom = block.name.startsWith("mcp__");
              const displayName = isCustom
                ? `🔮 ${block.name.replace("mcp__code-metrics__", "")}`
                : `🔧 ${block.name}`;

              console.log(`\n${displayName}`);
              console.log(`   ${JSON.stringify(block.input)}`);
            }
          }
        }
        break;

      case "user":
        // Show abbreviated tool results
        if (message.message.content) {
          for (const block of message.message.content) {
            if (block.type === "tool_result") {
              const content =
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content);

              // Truncate for readability
              const truncated =
                content.length > 150 ? content.slice(0, 150) + "..." : content;

              console.log(`   → ${truncated}`);
            }
          }
        }
        break;

      case "result":
        console.log("\n" + "═".repeat(60));
        console.log("📊 ANALYSIS COMPLETE");
        console.log("═".repeat(60));
        if (message.subtype === "success") {
          console.log(`✅ Status: ${message.subtype}`);
          console.log(`🔄 Turns: ${turnCount}`);
          console.log(`💰 Cost: $${message.total_cost_usd.toFixed(4)}`);
          console.log(
            `📈 Tokens: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`
          );
        } else {
          console.log(`⚠️  Status: ${message.subtype}`);
        }
        break;
    }
  }
}

main().catch(console.error);
