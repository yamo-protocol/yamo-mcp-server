import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import crypto from "crypto";

async function runTest() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: {
      ...process.env,
      CONTRACT_ADDRESS: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      RPC_URL: "http://127.0.0.1:8545"
    }
  });

  const client = new Client({
    name: "test-agent",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  // Define a YAMO Genesis Block
  const yamoContent = `
block: 00001;
previous_block: 0;
agent: Genesis_Agent;
intent: initialize_yamo_chain;
output: yamo_chain_started;
meta: hypothesis;Blockchain anchoring works;
meta: confidence;1.0;
signature: genesis_sig;
  `.trim();

  const contentHash = crypto.createHash('sha256').update(yamoContent).digest('hex');

  console.log("Submitting YAMO Genesis Block...");
  const submitResult = await client.callTool({
    name: "yamo_submit_block",
    arguments: {
      blockId: "00001",
      previousBlock: "0",
      contentHash: contentHash,
      consensusType: "genesis",
      ledger: "local_hardhat"
    }
  });

  console.log("Submit Result:", JSON.stringify(submitResult, null, 2));

  console.log("\nVerifying Block...");
  const verifyResult = await client.callTool({
    name: "yamo_verify_block",
    arguments: {
      blockId: "00001",
      contentHash: contentHash
    }
  });

  console.log("Verify Result:", JSON.stringify(verifyResult, null, 2));

  process.exit(0);
}

runTest().catch(console.error);
