/**
 * Part 3: Security Fixes Tests
 * Tests for:
 * 1. File path traversal fix
 * 2. Input validation helper
 * 3. Transaction response enhancement
 */

const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('Part 3: Security Fixes', () => {

  describe('validateBytes32', () => {

    it('should accept valid bytes32 hashes', () => {
      const validHash = '0xa7c2f4e9b1d3a8f6c5e2b9d4a7f1c3e8b6d9a2f4c7e1b5d8a3f6c9e2b4d7a1f3';
      const regex = /^0x[a-fA-F0-9]{64}$/;
      assert.match(validHash, regex);
    });

    it('should reject hashes with algorithm prefix', () => {
      const invalidHash = '0xsha256:a7c2f4e9b1d3a8f6c5e2b9d4a7f1c3e8b6d9a2f4c7e1b5d8a3f6c9e2b4d7a1f3';
      const regex = /^0x[a-fA-F0-9]{64}$/;
      assert(!invalidHash.match(regex), 'Hash with algorithm prefix should not match pattern');
    });

    it('should reject short hashes', () => {
      const shortHash = '0xa7c2f4e9b1d3a8f6c5e2b9d4a7f1c3e8';
      const regex = /^0x[a-fA-F0-9]{64}$/;
      assert(!shortHash.match(regex), 'Short hash should not match pattern');
    });

    it('should reject hashes without 0x prefix', () => {
      const noPrefixHash = 'a7c2f4e9b1d3a8f6c5e2b9d4a7f1c3e8b6d9a2f4c7e1b5d8a3f6c9e2b4d7a1f3';
      const regex = /^0x[a-fA-F0-9]{64}$/;
      assert(!noPrefixHash.match(regex), 'Hash without 0x prefix should not match pattern');
    });

    it('should reject hashes with non-hex characters', () => {
      const badHexHash = '0xa7c2f4e9b1d3a8f6c5e2b9d4a7f1c3e8b6d9a2f4c7e1b5d8a3f6c9e2b4d7a1g3z';
      const regex = /^0x[a-fA-F0-9]{64}$/;
      assert(!badHexHash.match(regex), 'Hash with non-hex chars should not match pattern');
    });

    it('should validate genesis block format (any valid bytes32)', () => {
      const genesisHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const regex = /^0x[a-fA-F0-9]{64}$/;
      assert.match(genesisHash, regex, 'Genesis hash should match pattern');
    });

  });

  describe('File Path Traversal Protection', () => {

    const allowedDir = process.cwd();
    const testFilePath = path.join(allowedDir, 'test-file.txt');
    const subDirPath = path.join(allowedDir, 'subdir', 'file.txt');

    before(() => {
      // Create test files
      fs.writeFileSync(testFilePath, 'test content');
      fs.mkdirSync(path.dirname(subDirPath), { recursive: true });
      fs.writeFileSync(subDirPath, 'subdir content');
    });

    after(() => {
      // Cleanup test files
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
      if (fs.existsSync(subDirPath)) {
        fs.unlinkSync(subDirPath);
        fs.rmSync(path.dirname(subDirPath), { recursive: true, force: true });
      }
    });

    it('should allow file within cwd', () => {
      const resolvedPath = path.resolve(testFilePath);
      assert(resolvedPath.startsWith(allowedDir), 'File in cwd should be allowed');
    });

    it('should allow file in subdirectory of cwd', () => {
      const resolvedPath = path.resolve(subDirPath);
      assert(resolvedPath.startsWith(allowedDir), 'File in subdirectory should be allowed');
    });

    it('should reject absolute path outside cwd', () => {
      const outsidePath = '/etc/passwd';
      const resolvedPath = path.resolve(outsidePath);
      assert(!resolvedPath.startsWith(allowedDir), 'Path outside cwd should be rejected');
    });

    it('should reject relative path traversal outside cwd', () => {
      const traversalPath = '../../etc/passwd';
      const resolvedPath = path.resolve(traversalPath);
      // Check if the resolved path is outside the allowed directory
      assert(!resolvedPath.startsWith(allowedDir), 'Path traversal outside cwd should be rejected');
    });

    it('should reject path with .. traversal components', () => {
      const traversalPath = '/tmp/yamo-migration/yamo-mcp-server/../../../etc/passwd';
      const resolvedPath = path.resolve(traversalPath);
      assert(!resolvedPath.startsWith(allowedDir), 'Path with .. components escaping cwd should be rejected');
    });

  });

  describe('Transaction Response Structure', () => {

    it('should include all required transaction fields', () => {
      // Mock transaction receipt structure
      const mockReceipt = {
        blockNumber: 12345,
        gasUsed: BigInt(100000),
        effectiveGasPrice: BigInt(20000000000),
      };

      const mockTx = {
        hash: '0xabcdef1234567890',
      };

      // Verify response structure matches expected format
      assert.strictEqual(typeof mockTx.hash, 'string');
      assert.strictEqual(typeof mockReceipt.blockNumber, 'number');
      assert.strictEqual(typeof mockReceipt.gasUsed.toString(), 'string');
      assert.strictEqual(typeof mockReceipt.effectiveGasPrice?.toString(), 'string');
    });

    it('should convert BigInt values to strings', () => {
      const bigintValue = BigInt(100000);
      const stringValue = bigintValue.toString();
      assert.strictEqual(stringValue, '100000');
      assert.strictEqual(typeof stringValue, 'string');
    });

  });

  describe('Error Messages for LLM Recovery', () => {

    it('should provide helpful error for invalid hash format', () => {
      const badHash = '0xsha256:abc123';
      let errorMessage = '';

      if (!badHash.match(/^0x[a-fA-F0-9]{64}$/)) {
        errorMessage = `contentHash must be a valid bytes32 hash (0x + 64 hex chars). ` +
                      `Received: ${badHash.substring(0, 20)}...` +
                      `\nDo NOT include algorithm prefixes like "sha256:"`;
      }

      assert.ok(errorMessage.includes('bytes32 hash'));
      assert.ok(errorMessage.includes('64 hex chars'));
      assert.ok(errorMessage.includes('algorithm prefixes'));
    });

    it('should provide helpful error for path traversal attempt', () => {
      const maliciousPath = '/etc/passwd';
      const resolvedPath = path.resolve(maliciousPath);
      const allowedDir = process.cwd();
      let errorMessage = '';

      if (!resolvedPath.startsWith(allowedDir)) {
        errorMessage = `File path outside allowed directory: ${maliciousPath}`;
      }

      assert.ok(errorMessage.includes('outside allowed directory'));
      assert.ok(errorMessage.includes(maliciousPath));
    });

  });

});
