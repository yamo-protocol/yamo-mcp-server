const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

// Configuration
const SERVER_PATH = path.resolve(__dirname, '../dist/index.js');
const BLOCK_ID = "test_block_1767593537236_2";
const EXPECTED_HASH = "0xf2a39ceaa3c41e7e35bf4af178d1ba9a6e1817307a451643e502e9982b672bb5";

// Env vars for Sepolia
const ENV = {
  ...process.env,
  RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
  CONTRACT_ADDRESS: "0x3c9440fa8d604E732233ea17095e14be1a53b015",
  PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" // Using test key, read-only ops are safe
};

function runIntegrationTest() {
  console.log("🚀 Starting MCP Server Integration Test (Sepolia)...");
  console.log(`   Target Block: ${BLOCK_ID}`);

  const server = spawn('node', [SERVER_PATH], {
    env: ENV,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';

  server.stdout.on('data', (data) => {
    const chunk = data.toString();
    buffer += chunk;
    
    // Check if we have a full JSON-RPC message
    const lines = buffer.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const msg = JSON.parse(line);
        handleMessage(msg, server);
      } catch (e) {
        // Incomplete message, wait for more data
      }
    }
  });

  server.stderr.on('data', (data) => {
    console.error(`[Server Log] ${data}`);
  });

  // 1. Send Initialize Request
  const initMsg = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    }
  };

  server.stdin.write(JSON.stringify(initMsg) + "\n");
}

let step = 0;

function handleMessage(msg, server) {
  // console.log("Received:", JSON.stringify(msg, null, 2));

  if (msg.id === 1) {
    console.log("✅ Server Initialized");
    step++;
    
    // 2. Initialized Notification
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    }) + "\n");

    // 3. Call Tool: yamo_get_block
    console.log("Testing tool: yamo_get_block...");
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "yamo_get_block",
        arguments: {
          blockId: BLOCK_ID
        }
      }
    }) + "\n");
  } else if (msg.id === 2) {
    // Parse Tool Result
    const result = msg.result;
    if (result.isError) {
      console.error("❌ yamo_get_block failed:", result.content[0].text);
      process.exit(1);
    }

    const content = JSON.parse(result.content[0].text);
    console.log("✅ yamo_get_block response received");
    
    try {
      assert.strictEqual(content.success, true);
      assert.strictEqual(content.block.blockId, BLOCK_ID);
      assert.strictEqual(content.block.contentHash, EXPECTED_HASH);
      console.log("✅ Block data verified against expectation");
    } catch (e) {
      console.error("❌ Assertion Failed:", e.message);
      process.exit(1);
    }

    // 4. Call Tool: yamo_get_latest_block
    console.log("Testing tool: yamo_get_latest_block...");
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "yamo_get_latest_block",
        arguments: {}
      }
    }) + "\n");

  } else if (msg.id === 3) {
    // Parse Tool Result
    const result = msg.result;
    if (result.isError) {
      console.error("❌ yamo_get_latest_block failed:", result.content[0].text);
      process.exit(1);
    }

    const content = JSON.parse(result.content[0].text);
    console.log("✅ yamo_get_latest_block response received");
    
    try {
      assert.strictEqual(content.success, true);
      assert.ok(content.block, "Latest block should be present");
      assert.ok(content.block.blockId, "Latest block should have an ID");
      console.log(`✅ Latest block verified: ${content.block.blockId}`);
      console.log("🎉 Integration Test Passed!");
      process.exit(0);
    } catch (e) {
      console.error("❌ Assertion Failed:", e.message);
      process.exit(1);
    }
  }
}

runIntegrationTest();
