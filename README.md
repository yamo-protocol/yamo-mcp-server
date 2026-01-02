# 🤖 YAMO Chain MCP Server (v1.0.1 - Protocol v0.4)

This MCP Server acts as a bridge, allowing LLMs to interact with the YAMO Blockchain. It is now powered by `@yamo/core` for robust IPFS handling.

## 📦 Installation

```bash
# Global installation (recommended)
npm install -g @yamo/mcp-server

# Or use npx (no installation needed)
npx @yamo/mcp-server
```

## 🧰 Tools Provided

### `yamo_submit_block`
Submits a new reasoning block.
*   **Input**: `blockId`, `contentHash`, etc.
*   **New Feature**: `content` (string) and `files` (array). If provided, the server handles IPFS uploading and Deep Bundling automatically before signing.
*   **Encryption**: Optional `encryptionKey` (string). If provided, the bundle is encrypted (AES-256-GCM) before upload, ensuring privacy for sensitive reasoning chains.

### `yamo_verify_block`
Verifies if a specific hash matches the immutable record.

## ⚙️ Configuration

### Option 1: Claude Desktop Integration (Recommended)

Add to your Claude Desktop config (`claude_desktop_config.json`):

**With Global Installation:**
```json
{
  "mcpServers": {
    "yamo-chain": {
      "command": "yamo-mcp-server",
      "env": {
        "CONTRACT_ADDRESS": "0x3c9440fa8d604E732233ea17095e14be1a53b015",
        "RPC_URL": "https://rpc.sepolia.org",
        "PRIVATE_KEY": "0xYOUR_PRIVATE_KEY",
        "USE_REAL_IPFS": "false",
        "PINATA_JWT": "optional_if_using_real_ipfs"
      }
    }
  }
}
```

**With npx (no installation):**
```json
{
  "mcpServers": {
    "yamo-chain": {
      "command": "npx",
      "args": ["@yamo/mcp-server"],
      "env": {
        "CONTRACT_ADDRESS": "0x3c9440fa8d604E732233ea17095e14be1a53b015",
        "RPC_URL": "https://rpc.sepolia.org",
        "PRIVATE_KEY": "0xYOUR_PRIVATE_KEY",
        "USE_REAL_IPFS": "false"
      }
    }
  }
}
```

### Option 2: Standalone Usage

Set environment variables and run:

```bash
export CONTRACT_ADDRESS=0x3c9440fa8d604E732233ea17095e14be1a53b015
export RPC_URL=https://rpc.sepolia.org
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# With global install
yamo-mcp-server

# Or with npx
npx @yamo/mcp-server
```

## 🌐 Networks

**Sepolia Testnet (default):**
- Contract: `0x3c9440fa8d604E732233ea17095e14be1a53b015`
- RPC: `https://rpc.sepolia.org` (free public RPC)

**Local Development:**
- Contract: Deploy using `@yamo/contracts`
- RPC: `http://127.0.0.1:8545`