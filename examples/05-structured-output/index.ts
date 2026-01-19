/**
 * Structured Output Example
 *
 * This example demonstrates how to get predictable, typed JSON responses
 * from the Claude Agent SDK using JSON Schema configuration.
 *
 * Use case: A code review agent that returns structured analysis results
 * that can be programmatically processed (e.g., integrated into CI/CD).
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

// ============================================================================
// JSON SCHEMA DEFINITION
// Defines the exact structure Claude must return
// ============================================================================

/**
 * JSON Schema for the code review response.
 *
 * Key schema features:
 * - `type: "object"` - The root must be an object
 * - `properties` - Defines each field and its type
 * - `enum` - Restricts values to a specific set
 * - `required` - Fields that must be present
 * - `additionalProperties: false` - Prevents extra fields
 */
const codeReviewSchema = {
  type: "object",
  properties: {
    // Array of issues found in the code
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "How serious is this issue",
          },
          category: {
            type: "string",
            enum: ["security", "performance", "maintainability", "bug", "style"],
            description: "Type of issue",
          },
          file: {
            type: "string",
            description: "File path where the issue was found",
          },
          line: {
            type: "integer",
            description: "Line number (approximate if spanning multiple lines)",
          },
          description: {
            type: "string",
            description: "Clear explanation of the issue",
          },
          suggestion: {
            type: "string",
            description: "How to fix the issue",
          },
        },
        required: ["severity", "category", "file", "description", "suggestion"],
        additionalProperties: false,
      },
    },
    // Overall quality score
    overallScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "Quality score from 0-100",
    },
    // Summary of the review
    summary: {
      type: "string",
      description: "Brief overall assessment of the code",
    },
    // Positive highlights
    strengths: {
      type: "array",
      items: { type: "string" },
      description: "Things the code does well",
    },
    // Metadata about the review
    metadata: {
      type: "object",
      properties: {
        filesReviewed: {
          type: "integer",
          description: "Number of files analyzed",
        },
        totalLines: {
          type: "integer",
          description: "Approximate total lines of code",
        },
        reviewFocus: {
          type: "array",
          items: { type: "string" },
          description: "Areas the review focused on",
        },
      },
      required: ["filesReviewed", "totalLines", "reviewFocus"],
      additionalProperties: false,
    },
  },
  required: ["issues", "overallScore", "summary", "strengths", "metadata"],
  additionalProperties: false,
};

// ============================================================================
// TYPESCRIPT TYPE (mirrors the schema for type safety)
// ============================================================================

interface CodeReviewResult {
  issues: Array<{
    severity: "low" | "medium" | "high" | "critical";
    category: "security" | "performance" | "maintainability" | "bug" | "style";
    file: string;
    line?: number;
    description: string;
    suggestion: string;
  }>;
  overallScore: number;
  summary: string;
  strengths: string[];
  metadata: {
    filesReviewed: number;
    totalLines: number;
    reviewFocus: string[];
  };
}

// ============================================================================
// SAMPLE CODE TO REVIEW
// A file with intentional issues for the agent to find
// ============================================================================

const sampleCodePath = "./examples/05-structured-output/sample-code.ts";
const sampleCode = `
// A sample e-commerce cart module with intentional issues

const API_KEY = "sk-1234567890abcdef"; // Hardcoded secret!

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

let cart: CartItem[] = [];

// Add item to cart
export function addToCart(item: any) { // Using 'any' type
  cart.push(item);
}

// Calculate total with discount
export function calculateTotal(discountCode: string): number {
  let total = 0;
  for (let i = 0; i < cart.length; i++) { // Could use reduce
    total += cart[i].price * cart[i].quantity;
  }

  // SQL injection vulnerability simulation
  const query = "SELECT discount FROM codes WHERE code = '" + discountCode + "'";
  console.log(query); // Would execute this in real app

  // Hardcoded discount logic
  if (discountCode === "SAVE10") {
    total = total * 0.9;
  }

  return total;
}

// Remove item - no bounds checking
export function removeItem(index: number) {
  cart.splice(index, 1); // No validation if index exists
}

// Clear cart
export function clearCart() {
  cart = [];
}

// Unused function - dead code
function formatPrice(price: number): string {
  return "$" + price.toFixed(2);
}

// Missing error handling
export async function syncCartToServer() {
  const response = await fetch("/api/cart", {
    method: "POST",
    body: JSON.stringify(cart),
  });
  return response.json(); // No error handling for failed requests
}
`;

// ============================================================================
// MAIN RUNNER
// ============================================================================

async function main() {
  console.log("\n📊 Structured Output Example");
  console.log("═".repeat(60));
  console.log("\nThis example demonstrates:");
  console.log("  • JSON Schema definition for response structure");
  console.log("  • Type-safe results with TypeScript interfaces");
  console.log("  • Programmatic access to review findings");
  console.log("  • Machine-readable output for CI/CD integration");
  console.log("\n" + "═".repeat(60));

  // First, write the sample code file for the agent to review
  const fs = await import("fs/promises");
  await fs.writeFile(sampleCodePath, sampleCode);
  console.log(`\n📝 Created sample code file: ${sampleCodePath}`);

  let turnCount = 0;
  let result: CodeReviewResult | null = null;

  console.log("\n🔍 Starting code review...\n");

  for await (const message of query({
    prompt: `You are a senior code reviewer. Please review the file at "${sampleCodePath}" and provide a thorough analysis.

Look for:
- Security vulnerabilities (hardcoded secrets, injection risks, etc.)
- Performance issues (inefficient algorithms, unnecessary operations)
- Maintainability problems (poor typing, missing error handling)
- Bugs (potential runtime errors, edge cases)
- Style issues (dead code, naming conventions)

Be specific about file locations and provide actionable suggestions.
Rate the overall code quality from 0-100.`,

    options: {
      model: "sonnet",
      maxTurns: 10,
      permissionMode: "bypassPermissions",

      // This is the key configuration for structured output!
      outputFormat: {
        type: "json_schema",
        schema: codeReviewSchema,
      },
    },
  })) {
    switch (message.type) {
      case "system":
        console.log(`📦 Session: ${message.session_id}`);
        console.log(`   Model: sonnet`);
        break;

      case "assistant":
        if (message.message.content) {
          const toolCalls = message.message.content.filter(
            (block: any) => block.type === "tool_use"
          );

          if (toolCalls.length > 0) {
            turnCount++;
            console.log(`🔄 Turn ${turnCount}: ${toolCalls.map((t: any) => t.name).join(", ")}`);
          }
        }
        break;

      case "user":
        // Tool results processed silently
        break;

      case "result":
        console.log("\n" + "═".repeat(60));
        console.log("📊 REVIEW COMPLETE");
        console.log("═".repeat(60));

        if (message.subtype === "success") {
          console.log(`✅ Status: ${message.subtype}`);
          console.log(`🔄 Turns: ${turnCount}`);
          console.log(`💰 Cost: $${message.total_cost_usd.toFixed(4)}`);

          // Access the structured output!
          if (message.structured_output) {
            result = message.structured_output as CodeReviewResult;
            console.log("\n✨ Structured output received!");
          } else {
            console.log("\n⚠️  No structured output in response");
          }
        } else {
          console.log(`⚠️  Status: ${message.subtype}`);
        }
        break;
    }
  }

  // ============================================================================
  // PROGRAMMATIC USE OF STRUCTURED OUTPUT
  // This is the real power - we can now process results automatically
  // ============================================================================

  if (result) {
    console.log("\n" + "═".repeat(60));
    console.log("🔎 PROGRAMMATIC RESULT ANALYSIS");
    console.log("═".repeat(60));

    // Summary
    console.log(`\n📋 Summary: ${result.summary}`);
    console.log(`\n⭐ Overall Score: ${result.overallScore}/100`);

    // Issues by severity (sorted)
    const severityOrder = ["critical", "high", "medium", "low"];
    const sortedIssues = [...result.issues].sort(
      (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
    );

    console.log(`\n🐛 Issues Found: ${result.issues.length}`);
    console.log("─".repeat(60));

    for (const issue of sortedIssues) {
      const severityEmoji = {
        critical: "🔴",
        high: "🟠",
        medium: "🟡",
        low: "🟢",
      }[issue.severity];

      console.log(`\n${severityEmoji} [${issue.severity.toUpperCase()}] ${issue.category}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ""}`);
      console.log(`   Issue: ${issue.description}`);
      console.log(`   Fix: ${issue.suggestion}`);
    }

    // Strengths
    if (result.strengths.length > 0) {
      console.log("\n" + "─".repeat(60));
      console.log("💪 Strengths:");
      for (const strength of result.strengths) {
        console.log(`   ✓ ${strength}`);
      }
    }

    // Metadata
    console.log("\n" + "─".repeat(60));
    console.log("📈 Review Metadata:");
    console.log(`   Files reviewed: ${result.metadata.filesReviewed}`);
    console.log(`   Total lines: ${result.metadata.totalLines}`);
    console.log(`   Focus areas: ${result.metadata.reviewFocus.join(", ")}`);

    // CI/CD integration example
    console.log("\n" + "═".repeat(60));
    console.log("🤖 CI/CD INTEGRATION EXAMPLE");
    console.log("═".repeat(60));

    const criticalCount = result.issues.filter((i) => i.severity === "critical").length;
    const highCount = result.issues.filter((i) => i.severity === "high").length;

    console.log(`\nCritical issues: ${criticalCount}`);
    console.log(`High issues: ${highCount}`);
    console.log(`Overall score: ${result.overallScore}`);

    // Simulated CI/CD decision
    const shouldBlock = criticalCount > 0 || result.overallScore < 50;
    const shouldWarn = highCount > 2 || result.overallScore < 70;

    if (shouldBlock) {
      console.log("\n❌ CI STATUS: FAIL");
      console.log("   Reason: Critical issues found or score below 50");
    } else if (shouldWarn) {
      console.log("\n⚠️  CI STATUS: WARNING");
      console.log("   Reason: Multiple high-severity issues or score below 70");
    } else {
      console.log("\n✅ CI STATUS: PASS");
      console.log("   Code quality meets minimum standards");
    }

    // Output as JSON for piping to other tools
    console.log("\n" + "─".repeat(60));
    console.log("📤 Raw JSON Output (for piping to other tools):");
    console.log("─".repeat(60));
    console.log(JSON.stringify(result, null, 2));
  }

  // Cleanup
  await fs.unlink(sampleCodePath).catch(() => {});
}

main().catch(console.error);
