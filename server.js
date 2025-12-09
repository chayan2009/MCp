import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";
import fs from "fs/promises";

dotenv.config();

const server = new McpServer({
  name: "Fraud MCP Server",
  version: "1.0.0",
});

let sampleTransactions = [];

async function loadSampleData() {
  const fileUrl = new URL("./fraud-data.json", import.meta.url);
  const text = await fs.readFile(fileUrl, "utf-8");
  sampleTransactions = JSON.parse(text);
}

async function checkFraudRisk(transaction) {
  const reasons = [];
  let riskScore = 10;
  if (transaction.amount > 5000) {
    riskScore += 30;
    reasons.push("High transaction amount");
  }
  if (transaction.merchantCountry !== transaction.userCountry) {
    riskScore += 40;
    reasons.push("Cross-border transaction");
  }
  if (transaction.channel === "CARD") {
    riskScore += 10;
    reasons.push("Card-not-present / card channel risk");
  }
  if (transaction.sourceBureauData) {
    const sb = transaction.sourceBureauData;
    if (sb.special_comments === "18") {
      riskScore += 5;
      reasons.push("Bureau special comment flag (18)");
    }
    if (sb.status === "12") {
      riskScore -= 5;
      reasons.push("Account status 12 from bureau (slightly lower risk)");
    }
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
      sourceBureauData: z.record(z.any()).optional(),
    }),
  },
  async ({ transaction }) => {
    const result = await checkFraudRisk(transaction);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

server.tool(
  "checkFraudRiskById",
  {
    transactionId: z.string(),
  },
  async ({ transactionId }) => {
    const tx = sampleTransactions.find(
      (t) => t.transactionId === transactionId
    );
    if (!tx) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Transaction not found",
              transactionId,
            }),
          },
        ],
      };
    }
    const result = await checkFraudRisk(tx);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

async function init() {
  await loadSampleData();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

init();
