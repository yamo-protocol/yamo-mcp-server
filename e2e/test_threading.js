const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const SERVER_PATH = path.resolve(__dirname, '../dist/index.js');
const GENESIS_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Simulating two independent reasoning threads
const THREAD_A = "thread_a";
const THREAD_B = "thread_b";

// Helper to calculate SHA-256 hash of content (what the server expects as input)
function calculateHash(content) {
    return "0x" + crypto.createHash("sha256").update(content).digest("hex");
}

function runThreadedTest() {
  console.log("🚀 Starting Threaded Submission Test...");

  const env = { 
      ...process.env, 
      RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
      CONTRACT_ADDRESS: "0x3c9440fa8d604E732233ea17095e14be1a53b015",
      PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  };
  const server = spawn('node', [SERVER_PATH], { env, stdio: ['pipe', 'pipe', 'pipe'] });

  let buffer = '';
  let requestId = 1;
  const pendingRequests = new Map();

  // Store the tip of each thread
  const threadTips = {
      [THREAD_A]: GENESIS_HASH, // Start new chain
      [THREAD_B]: GENESIS_HASH  // Start another new chain
  };

  server.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        // Handle Initialize Response (ID: 0)
        if (msg.id === 0 && msg.result) {
            console.log("✅ Server Initialized");
            // Send the notification that we are initialized
            server.stdin.write(JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized"
            }) + "\n");
            startThreads();
        } 
        // Handle other requests
        else if (msg.id && pendingRequests.has(msg.id)) {
            const handler = pendingRequests.get(msg.id);
            pendingRequests.delete(msg.id);
            handler(msg);
        }
      } catch (e) { }
    }
  });

  server.stderr.on('data', (data) => {
     console.error(`[Server Log] ${data}`);
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
      
      // CRITICAL: We explicitly pass the previous block from our context
      const previousBlock = threadTips[threadName];

      console.log(`\n[${threadName}] Submitting Step ${stepNum}...`);
      console.log(`   Input Parent: ${previousBlock.substring(0, 10)}...`);

      const result = await callTool("yamo_submit_block", {
          blockId,
          content,
          contentHash,
          previousBlock, // <--- The magic happens here
          consensusType: "ai_reasoning",
          ledger: threadName
      });

      if (result.success) {
          console.log(`   ✅ Success! New Hash: ${result.contentHash.substring(0, 10)}...`);
          // Update our context for the next step
          threadTips[threadName] = result.contentHash;
      } else {
          console.error(`   ❌ Failed: ${JSON.stringify(result)}`);
          process.exit(1);
      }
  }

  async function startThreads() {
      try {
          // Interleave submissions to prove independence
          
          // Thread A - Step 1
          await submitStep(THREAD_A, 1, "Agent A: I am starting a reasoning chain.");
          
          // Thread B - Step 1 (Should also use Genesis as parent, ignoring Thread A)
          await submitStep(THREAD_B, 1, "Agent B: I am a different agent.");

          // Thread A - Step 2 (Should link to Thread A - Step 1)
          await submitStep(THREAD_A, 2, "Agent A: This is my second thought.");

          // Thread B - Step 2 (Should link to Thread B - Step 1)
          await submitStep(THREAD_B, 2, "Agent B: I disagree with myself.");

          console.log("\n🎉 Threading Test Complete!");
          console.log(`Tip A: ${threadTips[THREAD_A]}`);
          console.log(`Tip B: ${threadTips[THREAD_B]}`);
          process.exit(0);

      } catch (e) {
          console.error("Test failed:", e);
          process.exit(1);
      }
  }
}

runThreadedTest();
