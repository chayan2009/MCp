import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// Create MCP server
const server = new McpServer({
  name: "Fraud MCP Server",
  version: "1.0.0",
});

// ---------- Dummy fraud logic ----------
/**
 * Very simple rule-based risk demo.
 * Replace this with your real fraud model / API later.
 */
async function checkFraudRisk(transaction) {
  const reasons = [];
  let riskScore = 10; // base score

  // Rule 1: High amount
  if (transaction.amount > 5000) {
    riskScore += 30;
    reasons.push("High transaction amount");
  }

  // Rule 2: Cross-border
  if (transaction.merchantCountry !== transaction.userCountry) {
    riskScore += 40;
    reasons.push("Cross-border transaction");
  }

  // Rule 3: Card channel slightly riskier
  if (transaction.channel === "CARD") {
    riskScore += 10;
    reasons.push("Card-not-present risk");
  }

  const riskLevel =
    riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";

  return {
    transactionId: transaction.transactionId,
    riskScore,
    riskLevel,
    reasons,
    recommendation:
      riskLevel === "HIGH"
        ? "Block the transaction and trigger OTP / manual review."
        : riskLevel === "MEDIUM"
        ? "Allow with step-up authentication (OTP, 3DS, etc.)."
        : "Allow transaction. Low fraud risk detected.",
  };
}

// ---------- Register MCP tool ----------
server.tool(
  "checkFraudRisk",
  {
    transaction: z.object({
      transactionId: z.string(),
      amount: z.number(),
      currency: z.string(),
      merchantCountry: z.string(),
      userCountry: z.string(),
      channel: z.enum(["CARD", "UPI", "WALLET"]),
      timestamp: z.string(),
    }),
  },
  async ({ transaction }) => {
    const result = await checkFraudRisk(transaction);
    return {
      content: [
        {
          type: "text",
          // JSON for the LLM, not for the end-user UI
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

// ---------- Init MCP server ----------
async function init() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

init();
