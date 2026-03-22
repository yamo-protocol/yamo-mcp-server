/**
 * Tests for yamo_audit_block logic
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const crypto = require('node:crypto');

// ── Pure-logic helpers mirroring handleAuditBlock ────────────────────────

function formatAuditResponse(block, bundle, encryptionKey) {
  const computedHash = "0x" + crypto.createHash("sha256").update(bundle.block).digest("hex");
  const verified = computedHash === block.contentHash;

  return {
    verified,
    blockId: block.blockId,
    onChainHash: block.contentHash,
    computedHash,
    ipfsCID: block.ipfsCID,
    agentAddress: block.agentAddress,
    timestamp: block.timestamp,
    wasEncrypted: !!encryptionKey
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('yamo_audit_block logic', () => {

  const mockBlock = {
    blockId: 'test_block',
    contentHash: '0x' + 'a'.repeat(64),
    ipfsCID: 'QmTest123',
    agentAddress: '0x123',
    timestamp: 123456789
  };

  it('should verify integrity when hashes match', () => {
    const content = 'test content';
    const contentHash = '0x' + crypto.createHash('sha256').update(content).digest('hex');
    
    const block = { ...mockBlock, contentHash };
    const bundle = { block: content, files: {} };
    
    const result = formatAuditResponse(block, bundle);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.computedHash, contentHash);
  });

  it('should fail verification when hashes mismatch', () => {
    const content = 'different content';
    const bundle = { block: content, files: {} };
    
    const result = formatAuditResponse(mockBlock, bundle);
    assert.strictEqual(result.verified, false);
    assert.notStrictEqual(result.computedHash, mockBlock.contentHash);
  });

  it('should track encryption status', () => {
    const content = 'test content';
    const bundle = { block: content, files: {} };
    
    const resultWithKey = formatAuditResponse(mockBlock, bundle, 'secret');
    assert.strictEqual(resultWithKey.wasEncrypted, true);
    
    const resultNoKey = formatAuditResponse(mockBlock, bundle);
    assert.strictEqual(resultNoKey.wasEncrypted, false);
  });

  it('should include all required metadata in response', () => {
    const content = 'test content';
    const bundle = { block: content, files: {} };
    const result = formatAuditResponse(mockBlock, bundle);
    
    assert.strictEqual(result.blockId, mockBlock.blockId);
    assert.strictEqual(result.ipfsCID, mockBlock.ipfsCID);
    assert.strictEqual(result.agentAddress, mockBlock.agentAddress);
    assert.strictEqual(result.timestamp, mockBlock.timestamp);
  });
});
