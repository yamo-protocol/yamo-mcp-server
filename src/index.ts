#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
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

// Validation helper for bytes32 hashes (Part 3: Security Fixes)
function validateBytes32(value: string, fieldName: string): void {
  if (!value.match(/^0x[a-fA-F0-9]{64}$/)) {
    throw new Error(
      `${fieldName} must be a valid bytes32 hash (0x + 64 hex chars). ` +
      `Received: ${value.substring(0, 20)}...` +
      `\nDo NOT include algorithm prefixes like "sha256:"`
    );
  }
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

  constructor() {
    this.server = new Server({ name: "yamo", version: pkg.version }, { capabilities: { tools: {} } });
    this.ipfs = new IpfsManager();
    this.chain = new YamoChainClient();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [SUBMIT_BLOCK_TOOL, GET_BLOCK_TOOL, GET_LATEST_BLOCK_TOOL, AUDIT_BLOCK_TOOL, VERIFY_BLOCK_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === "yamo_submit_block") {
          const { blockId, previousBlock, contentHash, consensusType, ledger, content, files, encryptionKey } = args as any;

          // Process files - auto-read if they're file paths (with security fix)
          let processedFiles = files;
          if (files && Array.isArray(files)) {
            processedFiles = files.map((file: any) => {
              // Check if content is a file path that exists
              if (typeof file.content === 'string' && fs.existsSync(file.content)) {
                // Security: Resolve to absolute path and restrict to cwd (Part 3: Security Fixes)
                const filePath = path.resolve(file.content);
                const allowedDir = process.cwd();
                if (!filePath.startsWith(allowedDir)) {
                  throw new Error(`File path outside allowed directory: ${file.content}`);
                }
                console.error(`[DEBUG] Auto-reading file from path: ${file.content}`);
                return {
                  name: file.name,
                  content: fs.readFileSync(filePath, 'utf8')
                };
              }
              // Otherwise use content as-is
              return file;
            });
          }

          // Input validation (Part 3: Security Fixes)
          validateBytes32(contentHash, "contentHash");

          // Auto-fetch previousBlock if not provided
          let resolvedPreviousBlock = previousBlock;
          if (!resolvedPreviousBlock) {
            console.error(`[INFO] No previousBlock provided, fetching latest block from chain...`);

            // First, try the cache (most reliable for chain continuation)
            if (this.latestContentHash) {
              resolvedPreviousBlock = this.latestContentHash;
              console.error(`[INFO] Using cached latest block's contentHash: ${resolvedPreviousBlock}`);
            } else {
              // Fallback to direct contract state read (reliable)
              const latestHash = await this.chain.getLatestBlockHash();
              if (latestHash && latestHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                resolvedPreviousBlock = latestHash;
                this.latestContentHash = latestHash; // Update cache
                console.error(`[INFO] Using latest block's contentHash from contract: ${resolvedPreviousBlock}`);
              } else {
                // No blocks exist yet, use genesis
                resolvedPreviousBlock = "0x0000000000000000000000000000000000000000000000000000000000000000";
                console.error(`[INFO] No existing blocks found, using genesis`);
              }
            }
          } else {
            validateBytes32(previousBlock, "previousBlock");
          }

          let ipfsCID = undefined;
          if (content) {
             ipfsCID = await this.ipfs.upload({
               content,
               files: processedFiles,
               encryptionKey
             });
          }

          const tx = await this.chain.submitBlock(blockId, resolvedPreviousBlock, contentHash, consensusType, ledger, ipfsCID);
          const receipt = await tx.wait();

          // Update cache with the new block's contentHash for chain continuation
          this.latestContentHash = contentHash;
          console.error(`[INFO] Updated latestContentHash cache: ${contentHash}`);

          return {
            content: [{ type: "text", text: JSON.stringify({
              success: true,
              blockId,
              transactionHash: tx.hash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
              ipfsCID: ipfsCID || null,
              previousBlock: resolvedPreviousBlock,
              contractAddress: this.chain.getContractAddress(),
              timestamp: new Date().toISOString()
            }, null, 2) }],
          };
        }

        if (name === "yamo_get_block") {
          const { blockId } = args as any;

          const block = await this.chain.getBlock(blockId);

          if (!block) {
            return {
              content: [{ type: "text", text: JSON.stringify({
                success: false,
                error: "Block not found on-chain",
                blockId,
                hint: "Verify the blockId or check if the block was submitted"
              }, null, 2) }],
              isError: false,
            };
          }

          return {
            content: [{ type: "text", text: JSON.stringify({
              success: true,
              block: {
                blockId: block.blockId,
                previousBlock: block.previousBlock,
                agentAddress: block.agentAddress,
                contentHash: block.contentHash,
                timestamp: block.timestamp,
                timestampISO: new Date(block.timestamp * 1000).toISOString(),
                consensusType: block.consensusType,
                ledger: block.ledger,
                ipfsCID: block.ipfsCID || null
              }
            }, null, 2) }],
          };
        }

        if (name === "yamo_get_latest_block") {
          const latestBlock = await this.chain.getLatestBlock();

          if (!latestBlock) {
            return {
              content: [{ type: "text", text: JSON.stringify({
                success: false,
                error: "No blocks found on-chain",
                hint: "The chain may be empty. Try submitting a genesis block first."
              }, null, 2) }],
              isError: false,
            };
          }

          return {
            content: [{ type: "text", text: JSON.stringify({
              success: true,
              block: {
                blockId: latestBlock.blockId,
                previousBlock: latestBlock.previousBlock,
                agentAddress: latestBlock.agentAddress,
                contentHash: latestBlock.contentHash,
                timestamp: latestBlock.timestamp,
                timestampISO: new Date(latestBlock.timestamp * 1000).toISOString(),
                consensusType: latestBlock.consensusType,
                ledger: latestBlock.ledger,
                ipfsCID: latestBlock.ipfsCID || null
              }
            }, null, 2) }],
          };
        }

        if (name === "yamo_audit_block") {
          const { blockId, encryptionKey } = args as any;

          // Get block from chain
          const block = await this.chain.getBlock(blockId);
          if (!block) {
            return {
              content: [{ type: "text", text: JSON.stringify({
                verified: false,
                error: "Block not found on-chain",
                blockId,
                hint: "Cannot audit non-existent block"
              }, null, 2) }],
              isError: false,
            };
          }

          // If no IPFS CID, can't audit content
          if (!block.ipfsCID) {
            return {
              content: [{ type: "text", text: JSON.stringify({
                verified: null,  // Cannot verify without IPFS
                onChainHash: block.contentHash,
                ipfsCID: null,
                note: "V1 block with no IPFS CID - cannot audit actual content",
                blockId,
                agentAddress: block.agentAddress,
                timestamp: block.timestamp
              }, null, 2) }],
            };
          }

          // Download and verify from IPFS
          try {
            const bundle = await this.ipfs.downloadBundle(block.ipfsCID, encryptionKey);
            const computedHash = "0x" + crypto.createHash("sha256").update(bundle.block).digest("hex");
            const verified = computedHash === block.contentHash;

            return {
              content: [{ type: "text", text: JSON.stringify({
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
              }, null, 2) }],
            };

          } catch (error: any) {
            // Enhanced error messages
            let errorType = "unknown";
            let hint = "";

            if (error.message.includes("encrypted") && !encryptionKey) {
              errorType = "missing_key";
              hint = "This bundle is encrypted. Provide encryptionKey to audit.";
            } else if (error.message.includes("Decryption failed") || error.message.includes("decrypt")) {
              errorType = "decryption_failed";
              hint = "The provided encryption key may be incorrect.";
            } else if (error.message.includes("not found on-chain")) {
              errorType = "block_not_found";
              hint = "Verify the blockId was submitted correctly.";
            }

            return {
              content: [{ type: "text", text: JSON.stringify({
                verified: false,
                error: error.message,
                errorType,
                hint,
                blockId
              }, null, 2) }],
              isError: true,
            };
          }
        }

        if (name === "yamo_verify_block") {
          const { blockId, contentHash } = args as any;
          const contract = this.chain.getContract(false);
          const hashBytes = contentHash.startsWith("0x") ? contentHash : `0x${contentHash}`;
          const isValid = await contract.verifyBlock(blockId, hashBytes);

          return {
            content: [{ type: "text", text: isValid ? "VERIFIED" : "FAILED" }],
          };
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            success: false,
            error: error.message,
            tool: name,
            timestamp: new Date().toISOString()
          }, null, 2) }],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`YAMO MCP Server v${pkg.version} running on stdio`);
  }
}

const server = new YamoMcpServer();
server.run().catch(console.error);