# 🤖 YAMO Chain MCP Server (v1.0.0 - Protocol v0.4)

This MCP Server acts as a bridge, allowing LLMs to interact with the YAMO Blockchain. It is now powered by `@yamo/core` for robust IPFS handling.

## 🧰 Tools Provided

### `yamo_submit_block`
Submits a new reasoning block.
*   **Input**: `blockId`, `contentHash`, etc.
*   **New Feature**: `content` (string) and `files` (array). If provided, the server handles IPFS uploading and Deep Bundling automatically before signing.
*   **Encryption**: Optional `encryptionKey` (string). If provided, the bundle is encrypted (AES-256-GCM) before upload, ensuring privacy for sensitive reasoning chains.

### `yamo_verify_block`
Verifies if a specific hash matches the immutable record.

## ⚙️ Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yamo-chain": {
      "command": "node",
      "args": ["/absolute/path/to/yamo/packages/mcp-server/dist/index.js"],
      "env": {
        "CONTRACT_ADDRESS": "0xe7f1...",
        "RPC_URL": "http://127.0.0.1:8545",
        "PRIVATE_KEY": "0x...",
        "USE_REAL_IPFS": "true",
        "PINATA_JWT": "eyJ..."
      }
    }
  }
}
```