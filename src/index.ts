#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { IpfsManager, YamoChainClient } from "@yamo/core";
import * as dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import path from "path";

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

dotenv.config();

// TypeScript interfaces for tool arguments and responses
interface FileInput {
  name: string;
  content: string;
}

interface SubmitBlockArgs {
  blockId: string;
  previousBlock?: string;
  contentHash: string;
  consensusType: string;
  ledger: string;
  content?: string;
  files?: FileInput[];
  encryptionKey?: string;
}

interface GetBlockArgs {
  blockId: string;
}

interface AuditBlockArgs {
  blockId: string;
  encryptionKey?: string;
}

interface VerifyBlockArgs {
  blockId: string;
  contentHash: string;
}

interface RawBlock {
  blockId: string;
  previousBlock: string;
  agentAddress: string;
  contentHash: string;
  timestamp: number;
  consensusType: string;
  ledger: string;
  ipfsCID?: string;
}

// Constants
const GENESIS_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const TOOL_NAMES = {
  SUBMIT_BLOCK: "yamo_submit_block",
  GET_BLOCK: "yamo_get_block",
  GET_LATEST_BLOCK: "yamo_get_latest_block",
  AUDIT_BLOCK: "yamo_audit_block",
  VERIFY_BLOCK: "yamo_verify_block",
  // Memory tools (read-only Ghost Protection)
  RECALL_LESSONS: "yamo_recall_lessons",
  // Bridge tools (require YAMO_BRIDGE_URL)
  BRIDGE_LIST_KERNELS: "yamo_bridge_list_kernels",
  BRIDGE_CLUSTER_STATUS: "yamo_bridge_cluster_status",
  BRIDGE_INVOKE_SKILL: "yamo_bridge_invoke_skill",
} as const;

const LOG_PREFIX = {
  DEBUG: "[DEBUG]",
  INFO: "[INFO]",
  ERROR: "[ERROR]",
} as const;

const VALIDATION_RULES = {
  BYTES32_PATTERN: /^0x[a-fA-F0-9]{64}$/,
  ETH_ADDRESS_PATTERN: /^0x[a-fA-F0-9]{40}$/,
} as const;

// ── Bridge HTTP helpers ────────────────────────────────────────────────────

/** HTTP base URL of the yamo-bridge, e.g. http://localhost:4001 */
const BRIDGE_HTTP_URL = process.env.YAMO_BRIDGE_URL
  ? process.env.YAMO_BRIDGE_URL.replace(/^ws/, "http").replace(/\/socket\/websocket$/, "")
  : process.env.YAMO_BRIDGE_HTTP_URL ?? null;

async function bridgeGet(path: string): Promise<unknown> {
  if (!BRIDGE_HTTP_URL) throw new Error("YAMO_BRIDGE_URL is not configured");
  const resp = await fetch(`${BRIDGE_HTTP_URL}${path}`);
  if (!resp.ok) throw new Error(`Bridge ${path} returned ${resp.status}`);
  return resp.json();
}

async function bridgeRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!BRIDGE_HTTP_URL) throw new Error("YAMO_BRIDGE_URL is not configured");
  const resp = await fetch(`${BRIDGE_HTTP_URL}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  if (!resp.ok) throw new Error(`Bridge /rpc returned ${resp.status}`);
  const body = await resp.json() as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`Bridge RPC error: ${body.error.message}`);
  return body.result;
}

// ── Memory tool definitions ────────────────────────────────────────────────

/** Environment variable that sets the path to the YAMO LanceDB directory.
 * Defaults to the same path yamo-os uses. Read-only — no writes via MCP. */
const YAMO_MEMORY_PATH = process.env.YAMO_MEMORY_PATH || "./data/memories.lance";

interface RecallLessonsArgs {
  limit?: number;
}

/** Minimal interface for the ESM MemoryMesh needed by this server. */
interface MemoryInterface {
  search(query: string, opts: { limit: number }): Promise<{ content: string }[]>;
}

const RECALL_LESSONS_TOOL: Tool = {
  name: TOOL_NAMES.RECALL_LESSONS,
  description: `Recall past LessonLearned constraints stored by YAMO agents.

Returns raw YAMO block content strings tagged with #lesson_learned. These are
constraints and rules discovered in past sessions that the current agent should
treat as active guidelines.

**Ghost Protection:** Call this at the start of each session to restore
institutional memory and avoid repeating past mistakes.

Read-only — never modifies the memory store.
Requires YAMO_MEMORY_PATH or defaults to ./data/memories.lance.`,
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of lessons to return (default: 5)",
        minimum: 1,
        maximum: 20,
      },
    },
  },
};

// ── Bridge tool definitions ────────────────────────────────────────────────

const BRIDGE_LIST_KERNELS_TOOL = {
  name: TOOL_NAMES.BRIDGE_LIST_KERNELS,
  description: `List all connected YAMO kernels and their skill capabilities via the bridge.

Returns each kernel's ID, capabilities (available skills), status, and last heartbeat.
Requires YAMO_BRIDGE_URL environment variable.`,
  inputSchema: { type: "object", properties: {} },
} satisfies Tool;

const BRIDGE_CLUSTER_STATUS_TOOL = {
  name: TOOL_NAMES.BRIDGE_CLUSTER_STATUS,
  description: `Get YAMO bridge cluster status — Raft leader, members, connected kernel count.

Requires YAMO_BRIDGE_URL environment variable.`,
  inputSchema: { type: "object", properties: {} },
} satisfies Tool;

const BRIDGE_INVOKE_SKILL_TOOL = {
  name: TOOL_NAMES.BRIDGE_INVOKE_SKILL,
  description: `Invoke a named YAMO skill on any capable kernel via the bridge.

The bridge finds a kernel that advertises the skill, routes the payload to it,
and returns the result synchronously (HTTP long-poll).

Use yamo_bridge_list_kernels to discover available skills first.
Requires YAMO_BRIDGE_URL environment variable.`,
  inputSchema: {
    type: "object",
    properties: {
      skill: {
        type: "string",
        description: "Name of the skill to invoke (must match a kernel's advertised capability)",
      },
      payload: {
        description: "Payload to pass to the skill handler (string or object)",
      },
      timeout_ms: {
        type: "number",
        description: "Max wait in milliseconds (default 30000, max 60000)",
      },
    },
    required: ["skill"],
  },
} satisfies Tool;

// Validation helpers
function validateBytes32(value: string, fieldName: string): void {
  if (!value.match(VALIDATION_RULES.BYTES32_PATTERN)) {
    throw new Error(
      `${fieldName} must be a valid bytes32 hash (0x + 64 hex chars). ` +
      `Received: ${value.substring(0, 20)}...` +
      `\nDo NOT include algorithm prefixes like "sha256:"`
    );
  }
}

function validateEthereumAddress(address: string, fieldName: string): void {
  if (!address || !address.match(VALIDATION_RULES.ETH_ADDRESS_PATTERN)) {
    throw new Error(`${fieldName} must be a valid Ethereum address (0x + 40 hex characters)`);
  }
}

function validateBlockId(blockId: string): void {
  if (!blockId) throw new Error("blockId is required");
  
  const parts = blockId.split('_');
  if (parts.length < 2) {
    throw new Error(`blockId must follow format {origin}_{workflow} (e.g., 'claude_chain'). Received: ${blockId}`);
  }
}

function validateEnvironment(): void {
  const requiredEnvVars = ['CONTRACT_ADDRESS', 'RPC_URL', 'PRIVATE_KEY'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate contract address format
  const contractAddress = process.env.CONTRACT_ADDRESS!;
  validateEthereumAddress(contractAddress, 'CONTRACT_ADDRESS');
}

const SUBMIT_BLOCK_TOOL: Tool = {
  name: "yamo_submit_block",
  description: `Submits a YAMO block to the YAMORegistry smart contract.

**IMPORTANT FORMAT REQUIREMENTS:**
- blockId: Must follow YAMO naming convention: {origin}_{workflow}
  • Examples: "claude_chain", "aurora_weave", "document_translation"
  • Do NOT use sequence numbers (001, 002)
- contentHash: Must be a valid bytes32 hash (32 bytes = 64 hex characters)
  • Format: "0x" followed by exactly 64 hexadecimal characters
  • Do NOT include algorithm prefixes (e.g., "sha256:")
- previousBlock: Content hash of parent block.
  • If omitted, automatically fetches the latest block's contentHash
  • For genesis block: 0x0000000000000000000000000000000000000000000000000000000000000000

**Transaction Flow:**
1. If previousBlock omitted, fetches latest block from chain automatically
2. Content and files are uploaded to IPFS (if provided)
3. Block is submitted to smart contract with hash reference
4. Returns transaction hash and IPFS CID`,
  inputSchema: {
    type: "object",
    properties: {
      blockId: {
        type: "string",
        description: "Unique block identifier following YAMO naming: {origin}_{workflow} (e.g., 'claude_chain')"
      },
      previousBlock: {
        type: "string",
        pattern: "^0x[a-fA-F0-9]{64}$",
        description: "Content hash of parent block. If omitted, auto-fetched from latest block. Use 0x0000...0000 for genesis."
      },
      contentHash: {
        type: "string",
        pattern: "^0x[a-fA-F0-9]{64}$",
        description: "32-byte hash (0x + 64 hex chars). No algorithm prefixes."
      },
      consensusType: {
        type: "string",
        enum: ["agent_vote", "PoW", "PoS", "cli_manual", "mcp_generated"],
        description: "Consensus mechanism"
      },
      ledger: {
        type: "string",
        description: "Distributed storage reference (e.g., 'ipfs', 'arweave')"
      },
      content: {
        type: "string",
        description: "Optional: Full YAMO text content for IPFS anchoring."
      },
      encryptionKey: {
        type: "string",
        description: "Optional: Strong key (12+ chars, mixed types) for IPFS encryption."
      },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            content: { type: "string" }
          },
          required: ["name", "content"]
        },
        description: "Optional: Output files to bundle. Content can be file path (auto-read) or actual content."
      }
    },
    required: ["blockId", "contentHash", "consensusType", "ledger"],
  },
};

const GET_BLOCK_TOOL: Tool = {
  name: "yamo_get_block",
  description: `Retrieves full block data from the YAMO blockchain.

Returns:
- blockId: Unique block identifier
- previousBlock: Content hash of parent block
- agentAddress: Ethereum address of submitter
- contentHash: 32-byte hash stored on-chain
- timestamp: Block submission timestamp (Unix epoch)
- consensusType: Consensus mechanism used
- ledger: Distributed storage reference
- ipfsCID: IPFS CID if content was anchored

Use for:
- Verifying block existence before submission
- Getting previousBlock hash for chain continuation
- Auditing block metadata
- Exploring chain history`,
  inputSchema: {
    type: "object",
    properties: {
      blockId: {
        type: "string",
        description: "Block ID to retrieve (e.g., 'aurora_weave', 'claude_chain')"
      }
    },
    required: ["blockId"],
  },
};

const GET_LATEST_BLOCK_TOOL: Tool = {
  name: "yamo_get_latest_block",
  description: `Retrieves the most recently submitted YAMO block from the blockchain.

Queries BlockSubmitted events to find the block with the highest timestamp,
then fetches its full details including the contentHash that should be used
as previousBlock for the next submission.

Returns:
- blockId: Unique block identifier
- previousBlock: Content hash of parent block
- agentAddress: Ethereum address of submitter
- contentHash: 32-byte hash stored on-chain (use as previousBlock for next submission)
- timestamp: Block submission timestamp (Unix epoch)
- consensusType: Consensus mechanism used
- ledger: Distributed storage reference
- ipfsCID: IPFS CID if content was anchored

Use for:
- Automatically getting the chain tip for extending the chain
- Fetching the contentHash to use as previousBlock in submitBlock
- Discovering the latest block without knowing its ID`,
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const AUDIT_BLOCK_TOOL: Tool = {
  name: "yamo_audit_block",
  description: `Performs cryptographic integrity audit of a block.

**Audit Process:**
1. Fetches block metadata from blockchain
2. Downloads content from IPFS (if CID exists)
3. Re-computes SHA-256 hash of downloaded content
4. Compares computed hash vs on-chain hash
5. Returns verification result with details

**For Encrypted Blocks:**
- Provide encryptionKey to decrypt before verification

Returns detailed audit report including:
- verified: true/false integrity check result
- onChainHash: Hash stored on blockchain
- computedHash: Hash computed from IPFS content
- ipfsCID: IPFS content identifier
- agentAddress: Submitter's Ethereum address
- contentPreview: First 500 chars of content`,
  inputSchema: {
    type: "object",
    properties: {
      blockId: {
        type: "string",
        description: "Block ID to audit (e.g., 'aurora_weave', 'claude_chain')"
      },
      encryptionKey: {
        type: "string",
        description: "Optional: Decryption key for encrypted bundles"
      }
    },
    required: ["blockId"],
  },
};

const VERIFY_BLOCK_TOOL: Tool = {
  name: "yamo_verify_block",
  description: `Quick hash verification against on-chain record.

**IMPORTANT:** This is a SIMPLE hash comparison, NOT a full content audit.
It only checks if a provided hash matches what's stored on-chain.

For full integrity verification (including IPFS content), use 'yamo_audit_block'.

Returns:
- "VERIFIED" if hash matches on-chain record
- "FAILED" if hash does not match`,
  inputSchema: {
    type: "object",
    properties: {
      blockId: {
        type: "string",
        description: "Block ID to verify"
      },
      contentHash: {
        type: "string",
        pattern: "^0x[a-fA-F0-9]{64}$",
        description: "32-byte hash to verify (0x + 64 hex chars)"
      }
    },
    required: ["blockId", "contentHash"],
  },
};

class YamoMcpServer {
  private server: Server;
  private ipfs: IpfsManager;
  private chain: YamoChainClient;
  // Cache for chain continuation: latest submitted block's contentHash
  private latestContentHash: string | null = null;
  // Lazy-initialized read-only MemoryMesh (ESM loaded via dynamic import)
  private memory: unknown = null;

  constructor(ipfs?: IpfsManager, chain?: YamoChainClient) {
    // Validate environment variables at startup
    validateEnvironment();

    this.server = new Server({ name: "yamo", version: pkg.version }, { capabilities: { tools: {} } });
    this.ipfs = ipfs || new IpfsManager();
    this.chain = chain || new YamoChainClient();
    this.setupHandlers();
  }

  // Response formatting helpers
  private createSuccessResponse(data: unknown): CallToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private createErrorResponse(error: unknown, isError: boolean = true): CallToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(error, null, 2) }],
      isError,
    };
  }

  private createTextResponse(text: string): CallToolResult {
    return { content: [{ type: "text", text }] };
  }

  // Logging helper
  private log(level: 'DEBUG' | 'INFO' | 'ERROR', message: string): void {
    const prefix = LOG_PREFIX[level];
    console.error(`${prefix} ${message}`);
  }

  // Cache update helper
  private updateLatestBlockCache(contentHash: string): void {
    this.latestContentHash = contentHash;
    this.log('INFO', `Updated latestContentHash cache: ${contentHash}`);
  }

  // Block formatting helper
  private formatBlockResponse(block: RawBlock): Record<string, unknown> {
    return {
      blockId: block.blockId,
      previousBlock: block.previousBlock,
      agentAddress: block.agentAddress,
      contentHash: block.contentHash,
      timestamp: block.timestamp,
      timestampISO: new Date(block.timestamp * 1000).toISOString(),
      consensusType: block.consensusType,
      ledger: block.ledger,
      ipfsCID: block.ipfsCID || null
    };
  }

  // File security validation
  private validateFileSecurity(filePath: string): void {
    const realPath = fs.realpathSync(filePath);
    const allowedDir = fs.realpathSync(process.cwd());

    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed: ${filePath}`);
    }

    if (!realPath.startsWith(allowedDir)) {
      throw new Error(`File path outside allowed directory: ${filePath}`);
    }
  }

  // File processing helper
  private async processSingleFile(file: FileInput): Promise<FileInput> {
    if (typeof file.content === 'string' && fs.existsSync(file.content)) {
      this.validateFileSecurity(file.content);
      this.log('DEBUG', `Auto-reading file from path: ${file.content}`);
      const content = await fs.promises.readFile(fs.realpathSync(file.content), 'utf8');
      return { name: file.name, content };
    }
    return file;
  }

  // Previous block resolution helper
  private async resolvePreviousBlock(previousBlock?: string): Promise<string> {
    if (previousBlock) return previousBlock;

    this.log('INFO', 'No previousBlock provided, fetching latest block from chain...');

    if (this.latestContentHash) {
      this.log('INFO', `Using cached latest block's contentHash: ${this.latestContentHash}`);
      return this.latestContentHash;
    }

    const latestHash = await this.chain.getLatestBlockHash();
    if (latestHash && latestHash !== GENESIS_HASH) {
      this.latestContentHash = latestHash;
      this.log('INFO', `Using latest block's contentHash from contract: ${latestHash}`);
      return latestHash;
    }

    this.log('INFO', 'No existing blocks found, using genesis');
    return GENESIS_HASH;
  }

  private async handleSubmitBlock(args: SubmitBlockArgs) {
    const { blockId, previousBlock, contentHash, consensusType, ledger, content, files, encryptionKey } = args;

    // Validate inputs
    validateBlockId(blockId);
    validateBytes32(contentHash, "contentHash");
    if (previousBlock) {
      validateBytes32(previousBlock, "previousBlock");
    }

    // Process files with security validation
    const processedFiles = files && Array.isArray(files)
      ? await Promise.all(files.map(f => this.processSingleFile(f)))
      : files;

    // Resolve previous block hash
    const resolvedPreviousBlock = await this.resolvePreviousBlock(previousBlock);

    // Upload to IPFS if content provided
    let ipfsCID = undefined;
    if (content) {
      ipfsCID = await this.ipfs.upload({
        content,
        files: processedFiles,
        encryptionKey
      });
    }

    // Submit to blockchain
    const tx = await this.chain.submitBlock(blockId, resolvedPreviousBlock, contentHash, consensusType, ledger, ipfsCID);
    const receipt = await tx.wait();

    // Update cache
    this.updateLatestBlockCache(contentHash);

    return this.createSuccessResponse({
      success: true,
      blockId,
      transactionHash: tx.hash,
      contentHash: contentHash, // Returned for easier chain linking
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
      ipfsCID: ipfsCID || null,
      previousBlock: resolvedPreviousBlock,
      contractAddress: this.chain.getContractAddress(),
      timestamp: new Date().toISOString()
    });
  }

  private async handleGetBlock(args: GetBlockArgs) {
    const { blockId } = args;
    const block = await this.chain.getBlock(blockId);

    if (!block) {
      return this.createErrorResponse({
        success: false,
        error: "Block not found on-chain",
        blockId,
        hint: "Verify the blockId or check if the block was submitted"
      });
    }

    return this.createSuccessResponse({
      success: true,
      block: this.formatBlockResponse(block)
    });
  }

  private async handleGetLatestBlock() {
    const latestBlock = await this.chain.getLatestBlock();

    if (!latestBlock) {
      return this.createErrorResponse({
        success: false,
        error: "No blocks found on-chain",
        hint: "The chain may be empty. Try submitting a genesis block first."
      });
    }

    return this.createSuccessResponse({
      success: true,
      block: this.formatBlockResponse(latestBlock)
    });
  }

  private async handleAuditBlock(args: AuditBlockArgs) {
    const { blockId, encryptionKey } = args;

    const block = await this.chain.getBlock(blockId);
    if (!block) {
      return this.createErrorResponse({
        verified: false,
        error: "Block not found on-chain",
        blockId,
        hint: "Cannot audit non-existent block"
      });
    }

    if (!block.ipfsCID) {
      return this.createSuccessResponse({
        verified: null,
        onChainHash: block.contentHash,
        ipfsCID: null,
        note: "V1 block with no IPFS CID - cannot audit actual content",
        blockId,
        agentAddress: block.agentAddress,
        timestamp: block.timestamp
      });
    }

    try {
      const bundle = await this.ipfs.downloadBundle(block.ipfsCID, encryptionKey);
      const computedHash = "0x" + crypto.createHash("sha256").update(bundle.block).digest("hex");
      const verified = computedHash === block.contentHash;

      return this.createSuccessResponse({
        verified,
        blockId,
        onChainHash: block.contentHash,
        computedHash,
        ipfsCID: block.ipfsCID,
        agentAddress: block.agentAddress,
        timestamp: block.timestamp,
        timestampISO: new Date(block.timestamp * 1000).toISOString(),
        consensusType: block.consensusType,
        ledger: block.ledger,
        contentPreview: bundle.block.substring(0, 500) + (bundle.block.length > 500 ? "..." : ""),
        contentLength: bundle.block.length,
        artifactFiles: Object.keys(bundle.files),
        wasEncrypted: !!encryptionKey
      });
    } catch (error: unknown) {
      let errorType = "unknown";
      let hint = "";
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("encrypted") && !encryptionKey) {
        errorType = "missing_key";
        hint = "This bundle is encrypted. Provide encryptionKey to audit.";
      } else if (errorMessage.includes("Decryption failed") || errorMessage.includes("decrypt")) {
        errorType = "decryption_failed";
        hint = "The provided encryption key may be incorrect.";
      } else if (errorMessage.includes("not found on-chain")) {
        errorType = "block_not_found";
        hint = "Verify the blockId was submitted correctly.";
      }

      return this.createErrorResponse({
        verified: false,
        error: errorMessage,
        errorType,
        hint,
        blockId
      });
    }
  }

  private async handleVerifyBlock(args: VerifyBlockArgs) {
    const { blockId, contentHash } = args;
    const contract = this.chain.getContract(false);
    const hashBytes = contentHash.startsWith("0x") ? contentHash : `0x${contentHash}`;
    const isValid = await contract.verifyBlock(blockId, hashBytes);

    return this.createTextResponse(isValid ? "VERIFIED" : "FAILED");
  }

  // ── Bridge tool handlers ──────────────────────────────────────────────────

  private async handleBridgeListKernels() {
    const result = await bridgeRpc("kernel.list", {}) as { kernels: unknown[]; count: number };
    return this.createSuccessResponse({
      kernels: result.kernels,
      count: result.count,
      bridge: BRIDGE_HTTP_URL,
    });
  }

  private async handleBridgeClusterStatus() {
    const result = await bridgeGet("/cluster/status");
    return this.createSuccessResponse(result as Record<string, unknown>);
  }

  private async handleBridgeInvokeSkill(args: unknown) {
    const { skill, payload, timeout_ms } = args as {
      skill: string;
      payload?: unknown;
      timeout_ms?: number;
    };
    if (!skill) throw new Error("skill is required");

    const params: Record<string, unknown> = { skill };
    if (payload !== undefined) params.payload = payload;
    if (timeout_ms !== undefined) params.timeout_ms = timeout_ms;

    const result = await bridgeRpc("skill.invoke", params) as {
      skill: string;
      handler_id: string;
      result: unknown;
    };

    return this.createSuccessResponse({
      skill: result.skill,
      handler_id: result.handler_id,
      result: result.result,
    });
  }

  // ── Memory tool handlers ──────────────────────────────────────────────────

  /** Lazy-init MemoryMesh in read-only mode (no add() calls).
   * Uses dynamic import() because @yamo/memory-mesh is ESM. */
  private async getMemory(): Promise<MemoryInterface> {
    if (!this.memory) {
      const mod = await import("@yamo/memory-mesh") as { MemoryMesh: new (opts?: { path?: string }) => MemoryInterface };
      const mesh: MemoryInterface = new mod.MemoryMesh({ path: YAMO_MEMORY_PATH });
      this.memory = mesh;
    }
    return this.memory as MemoryInterface;
  }

  private async handleRecallLessons(args?: RecallLessonsArgs): Promise<CallToolResult> {
    const limit = Math.min(Math.max(args?.limit ?? 5, 1), 20);
    try {
      const mesh = await this.getMemory();
      const results = await mesh.search(
        "LessonLearned constraint preventative rule #lesson_learned",
        { limit },
      );
      // Return raw content strings — NEVER parse YAMO block fields here.
      // The calling LLM interprets the content; the machine only retrieves it.
      const lessons = results
        .map((r) => r.content as string)
        .filter((c) => Boolean(c && c.trim()));

      if (lessons.length === 0) {
        return this.createTextResponse("No lessons found. Memory may be empty or not yet initialized.");
      }

      // Join with double newline — raw YAMO blocks, no wrapping, no JSON.
      return this.createTextResponse(lessons.join("\n\n"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Memory unavailable is non-fatal — return empty rather than error
      this.log("ERROR", `recall_lessons: ${msg}`);
      return this.createTextResponse(`Memory unavailable: ${msg}`);
    }
  }

  // Tool handler registry
  private toolHandlers: Record<string, (args?: unknown) => Promise<CallToolResult>> = {
    [TOOL_NAMES.SUBMIT_BLOCK]: (args) => this.handleSubmitBlock(args as SubmitBlockArgs),
    [TOOL_NAMES.GET_BLOCK]: (args) => this.handleGetBlock(args as GetBlockArgs),
    [TOOL_NAMES.GET_LATEST_BLOCK]: () => this.handleGetLatestBlock(),
    [TOOL_NAMES.AUDIT_BLOCK]: (args) => this.handleAuditBlock(args as AuditBlockArgs),
    [TOOL_NAMES.VERIFY_BLOCK]: (args) => this.handleVerifyBlock(args as VerifyBlockArgs),
    [TOOL_NAMES.RECALL_LESSONS]: (args) => this.handleRecallLessons(args as RecallLessonsArgs),
    [TOOL_NAMES.BRIDGE_LIST_KERNELS]: () => this.handleBridgeListKernels(),
    [TOOL_NAMES.BRIDGE_CLUSTER_STATUS]: () => this.handleBridgeClusterStatus(),
    [TOOL_NAMES.BRIDGE_INVOKE_SKILL]: (args) => this.handleBridgeInvokeSkill(args),
  };

  private setupHandlers() {
    // Bridge tools are only exposed when YAMO_BRIDGE_URL is configured
    const bridgeTools = BRIDGE_HTTP_URL
      ? [BRIDGE_LIST_KERNELS_TOOL, BRIDGE_CLUSTER_STATUS_TOOL, BRIDGE_INVOKE_SKILL_TOOL]
      : [];

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [SUBMIT_BLOCK_TOOL, GET_BLOCK_TOOL, GET_LATEST_BLOCK_TOOL, AUDIT_BLOCK_TOOL, VERIFY_BLOCK_TOOL, RECALL_LESSONS_TOOL, ...bridgeTools],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const handler = this.toolHandlers[name];
        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }
        return await handler(args);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return this.createErrorResponse({
          success: false,
          error: errorMessage,
          tool: name,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.log('INFO', `YAMO MCP Server v${pkg.version} running on stdio`);
  }
}

const server = new YamoMcpServer();
server.run().catch(console.error);