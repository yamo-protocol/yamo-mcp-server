const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// We will use a wrapper script that mocks the module before loading the server
const WRAPPER_SCRIPT = `
const { Module } = require('module');
const originalRequire = Module.prototype.require;

// Mock the YamoChainClient
const MockChain = {
  YamoChainClient: class {
    constructor() {}
    getContractAddress() { return "0xMockContract"; }
    getLatestBlockHash() { return "0x0000000000000000000000000000000000000000000000000000000000000000"; }
    async submitBlock(blockId, previous, contentHash) {
      console.error("[MockChain] Submitting " + blockId + " linked to " + previous.substring(0,10) + "...");
      return {
        wait: async () => ({
          blockNumber: 12345,
          gasUsed: 21000n,
          effectiveGasPrice: 1000000000n
        }),
        hash: "0xMockTxHash_" + Math.floor(Math.random() * 10000)
      };
    }
  }
};

Module.prototype.require = function(id) {
  if (id === '@yamo/core') {
    // Return our mock combined with the real module's other exports if needed
    // But for this test, we just need the Chain Client
    // We try to load the real one to get other exports, but override the client
    try {
        const real = originalRequire.call(this, id);
        return { ...real, ...MockChain };
    } catch (e) {
        return MockChain;
    }
  }
  return originalRequire.call(this, id);
};

require('../dist/index.js');
`;

const WRAPPER_PATH = path.resolve(__dirname, 'server_wrapper.js');
fs.writeFileSync(WRAPPER_PATH, WRAPPER_SCRIPT);

const crypto = require('crypto');

// Simulating two independent reasoning threads
const THREAD_A = "thread_a";
const THREAD_B = "thread_b";

function calculateHash(content) {
    return "0x" + crypto.createHash("sha256").update(content).digest("hex");
}

function runThreadedTest() {
  console.log("🚀 Starting Mocked Threading Test...");

  // Run the wrapper instead of the direct server
  const env = { 
      ...process.env, 
      RPC_URL: "http://mock-rpc",
      CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
      PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001"
  };
  
  const server = spawn('node', [WRAPPER_PATH], { env, stdio: ['pipe', 'pipe', 'pipe'] });

  let buffer = '';
  let requestId = 1;
  const pendingRequests = new Map();

  const threadTips = {
      [THREAD_A]: "0x0000000000000000000000000000000000000000000000000000000000000000",
      [THREAD_B]: "0x0000000000000000000000000000000000000000000000000000000000000000" 
  };

  server.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); 

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id === 0 && msg.result) {
            console.log("✅ Server Initialized (Mocked)");
            server.stdin.write(JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized"
            }) + "\n");
            startThreads();
        } else if (msg.id && pendingRequests.has(msg.id)) {
            const handler = pendingRequests.get(msg.id);
            pendingRequests.delete(msg.id);
            handler(msg);
        }
      } catch (e) { } // Ignore parse errors
    }
  });

  server.stderr.on('data', (data) => {
      // Uncomment to debug server logs
      console.error(`[Server] ${data}`);
  });

  // 1. Initialize
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } }
  }) + "\n");

  async function callTool(name, args) {
      return new Promise((resolve, reject) => {
          const id = requestId++;
          const req = {
              jsonrpc: "2.0",
              id,
              method: "tools/call",
              params: { name, arguments: args }
          };
          pendingRequests.set(id, (msg) => {
              if (msg.error) reject(msg.error);
              else {
                  const content = JSON.parse(msg.result.content[0].text);
                  resolve(content);
              }
          });
          server.stdin.write(JSON.stringify(req) + "\n");
      });
  }

  async function submitStep(threadName, stepNum, content) {
      const blockId = `${threadName}_step_${stepNum}_${Date.now()}`;
      const contentHash = calculateHash(content);
      const previousBlock = threadTips[threadName];

      console.log(`
[${threadName}] Submitting Step ${stepNum}...
`);
      
      const result = await callTool("yamo_submit_block", {
          blockId,
          content,
          contentHash,
          previousBlock, 
          consensusType: "ai_reasoning",
          ledger: threadName
      });

      if (result.success) {
          console.log(`   ✅ Success!`);
          console.log(`   Returned ContentHash: ${result.contentHash.substring(0,10)}...`);
          console.log(`   Linked to Previous:   ${result.previousBlock.substring(0,10)}...`);
          
          if (result.previousBlock !== previousBlock) {
              console.error("   ❌ ERROR: Linkage mismatch!");
              process.exit(1);
          }
          
          threadTips[threadName] = result.contentHash;
      } else {
          console.error(`   ❌ Failed: ${JSON.stringify(result)}`);
          process.exit(1);
      }
  }

  async function startThreads() {
      try {
          await submitStep(THREAD_A, 1, "Agent A: Start");
          await submitStep(THREAD_B, 1, "Agent B: Start");
          
          await submitStep(THREAD_A, 2, "Agent A: Continue");
          await submitStep(THREAD_B, 2, "Agent B: Continue");

          console.log("\n🎉 Threading Test Complete!");
          console.log(`Tip A: ${threadTips[THREAD_A]}`);
          console.log(`Tip B: ${threadTips[THREAD_B]}`);
          
          // Clean up
          fs.unlinkSync(WRAPPER_PATH);
          process.exit(0);

      } catch (e) {
          console.error("Test failed:", e);
          fs.unlinkSync(WRAPPER_PATH);
          process.exit(1);
      }
  }
}

runThreadedTest();
