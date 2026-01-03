# 🤖 YAMO Chain MCP Server [![npm version](https://img.shields.io/npm/v/@yamo/mcp-server)](https://www.npmjs.com/package/@yamo/mcp-server)

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
        "RPC_URL": "https://ethereum-sepolia-rpc.publicnode.com",
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
        "RPC_URL": "https://ethereum-sepolia-rpc.publicnode.com",
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
export RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# With global install
yamo-mcp-server

# Or with npx
npx @yamo/mcp-server
```

## 🌐 Networks

### Sepolia Testnet (Production - Recommended)

**Configuration:**
- Contract: `0x3c9440fa8d604E732233ea17095e14be1a53b015`
- RPC: `https://ethereum-sepolia-rpc.publicnode.com`

**Requirements:**
- ✅ Wallet with Sepolia ETH for gas
- ✅ Public RPC endpoint (no API key needed)

### Local Development

**Configuration:**
- Contract: Deploy using `@yamo/contracts`
- RPC: `http://127.0.0.1:8545`

**Requirements:**
- ⚠️ Local Hardhat node must be running: `npx hardhat node`
- ⚠️ Contract must be deployed locally
- ⚠️ Wallet must be funded with local ETH

## 💰 Wallet Setup

### 1. Generate a Wallet

If you don't have a private key:
```bash
node -e "const ethers = require('ethers'); const w = ethers.Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey);"
```

### 2. Get Sepolia ETH (Testnet Only)

Your wallet needs Sepolia ETH for gas. Use your **wallet address** (not private key) with these faucets:

**Alchemy Faucet** (Fastest - 0.5 ETH):
- https://www.alchemy.com/faucets/ethereum-sepolia
- Sign in with Google/GitHub

**PoW Faucet** (No login - 0.05-0.1 ETH):
- https://sepolia-faucet.pk910.de/
- Mine for ~5 minutes

**Google Cloud Faucet** (0.05 ETH):
- https://cloud.google.com/application/web3/faucet/ethereum/sepolia

### 3. Check Your Balance

```bash
# Replace with your wallet address
curl -X POST https://ethereum-sepolia-rpc.publicnode.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xYOUR_ADDRESS","latest"],"id":1}'
```

If result is `"0x0"`, you need more ETH!

## ⚠️ Common Issues

### "Sender doesn't have enough funds"

**Problem:** Your wallet has 0 ETH or insufficient balance

**Solution:**
1. Check you're using **Sepolia RPC**, not localhost
2. Verify your wallet address has Sepolia ETH (see faucets above)
3. Make sure `PRIVATE_KEY` matches the funded wallet

### "Connection refused" or "ECONNREFUSED"

**Problem:** RPC_URL points to `http://127.0.0.1:8545` but no local node running

**Solution:**
- **For Sepolia:** Change RPC to `https://ethereum-sepolia-rpc.publicnode.com`
- **For Local:** Start Hardhat node: `cd packages/contracts && npx hardhat node`

### Balance shows 0 but I have ETH

**Problem:** Wrong network - you might have mainnet ETH, not Sepolia ETH

**Solution:**
1. Verify RPC is Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`
2. Check balance on Sepolia: https://sepolia.etherscan.io/
3. Get Sepolia testnet ETH from faucets (see above)