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

dotenv.config();

const SUBMIT_BLOCK_TOOL: Tool = {
  name: "yamo_submit_block",
  description: "Submits a YAMO block to the YAMORegistry smart contract.",
  inputSchema: {
    type: "object",
    properties: {
      blockId: { type: "string" },
      previousBlock: { type: "string" },
      contentHash: { type: "string" },
      consensusType: { type: "string" },
      ledger: { type: "string" },
      content: { type: "string", description: "Optional: Full YAMO text content for IPFS anchoring." },
      encryptionKey: { type: "string", description: "Optional: Key to encrypt the IPFS bundle." },
      files: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string"}, content: { type: "string" } } },
        description: "Optional: Array of output files to bundle. Each file's 'content' can be either the actual file content (string) or a file path (will be auto-read)."
      }
    },
    required: ["blockId", "previousBlock", "contentHash", "consensusType", "ledger"],
  },
};

const VERIFY_BLOCK_TOOL: Tool = {
  name: "yamo_verify_block",
  description: "Verifies a block's content hash.",
  inputSchema: {
    type: "object",
    properties: {
      blockId: { type: "string" },
      contentHash: { type: "string" },
    },
    required: ["blockId", "contentHash"],
  },
};

class YamoMcpServer {
  private server: Server;
  private ipfs: IpfsManager;
  private chain: YamoChainClient;

  constructor() {
    this.server = new Server({ name: "yamo", version: "1.0.0" }, { capabilities: { tools: {} } });
    this.ipfs = new IpfsManager();
    this.chain = new YamoChainClient();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [SUBMIT_BLOCK_TOOL, VERIFY_BLOCK_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === "yamo_submit_block") {
          const { blockId, previousBlock, contentHash, consensusType, ledger, content, files, encryptionKey } = args as any;

          // Process files - auto-read if they're file paths
          let processedFiles = files;
          if (files && Array.isArray(files)) {
            processedFiles = files.map((file: any) => {
              // Check if content is a file path that exists
              if (typeof file.content === 'string' && fs.existsSync(file.content)) {
                console.error(`Auto-reading file from path: ${file.content}`);
                return {
                  name: file.name,
                  content: fs.readFileSync(file.content, 'utf8')
                };
              }
              // Otherwise use content as-is
              return file;
            });
          }

          let ipfsCID = undefined;
          if (content) {
             ipfsCID = await this.ipfs.upload({
               content,
               files: processedFiles,
               encryptionKey
             });
          }

          const txHash = await this.chain.submitBlock(blockId, previousBlock, contentHash, consensusType, ledger, ipfsCID);

          return {
            content: [{ type: "text", text: `Block ${blockId} anchored. Tx: ${txHash}. IPFS: ${ipfsCID || "None"}` }],
          };
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
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("YAMO MCP Server v1.0.0 running on stdio");
  }
}

const server = new YamoMcpServer();
server.run().catch(console.error);