# @yamo/mcp-server

Model Context Protocol (MCP) server for YAMO Protocol integration with AI agents.

## Overview

The YAMO MCP server enables AI agents (like Claude) to submit YAMO blocks to the blockchain via the Model Context Protocol. It provides a bridge between AI reasoning and immutable on-chain storage.

## Features

- **MCP Tools**: `yamo_submit_block` and `yamo_verify_block`
- **IPFS Integration**: Automatic upload to IPFS with deep bundling
- **Blockchain Submission**: Direct interaction with YAMORegistry contracts
- **Environment Configuration**: Flexible setup for local and testnet deployments

## Installation

### From GitHub (Current Method)

```bash
# Clone the repository
git clone https://github.com/yamo-protocol/yamo-mcp-server.git
cd yamo-mcp-server

# Install dependencies (automatically builds @yamo/core)
npm install

# Build the server
npm run build

# Run the server
npm start
```

### From NPM (Coming Soon)

Once published to npm, you'll be able to install with:

```bash
npm install @yamo/mcp-server
```

_Note: The package is not yet published to npm. Please use the GitHub installation method above._

## Configuration

### Environment Variables

**Required:** Create a `.env` file before running the server:

```bash
cd yamo-mcp-server
cp .env.example .env
# Edit .env with your configuration
```

Or create it manually:

```bash
cat > .env << 'EOF'
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
PINATA_JWT=
EOF
```

**Note:** The private key shown above is from Hardhat's test accounts (safe for local development only). Never use it on mainnet or testnets with real funds.

### Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yamo": {
      "command": "node",
      "args": ["/path/to/yamo-mcp-server/dist/index.js"],
      "env": {
        "RPC_URL": "http://127.0.0.1:8545",
        "PRIVATE_KEY": "your_key",
        "CONTRACT_ADDRESS": "0x...",
        "PINATA_JWT": "your_jwt"
      }
    }
  }
}
```

## MCP Tools

### `yamo_submit_block`

Submit a YAMO block to the blockchain.

**Parameters:**
- `blockId` (required): Unique block identifier
- `previousBlock` (required): Previous block ID (use "genesis" for first block)
- `contentHash` (required): SHA256 hash of content
- `consensusType` (required): Consensus mechanism (e.g., "single_agent")
- `ledger` (required): Ledger name (e.g., "main")
- `content` (optional): Full YAMO content for IPFS upload
- `files` (optional): Array of output files to bundle with the block

**Example:**

```typescript
{
  "blockId": "block_001",
  "previousBlock": "genesis",
  "contentHash": "0xabc123...",
  "consensusType": "single_agent",
  "ledger": "main",
  "content": "agent: MyAgent;\nintent: test;",
  "files": [
    {
      "name": "output.json",
      "content": "{\"result\": \"success\"}"
    }
  ]
}
```

### `yamo_verify_block`

Verify a block's integrity.

**Parameters:**
- `blockId` (required): Block ID to verify
- `contentHash` (required): Expected content hash

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run server
npm start

# Development mode
npm run dev
```

## Testing

Run the E2E test suite:

```bash
node e2e/mcp_super.test.js
```

## License

MIT
