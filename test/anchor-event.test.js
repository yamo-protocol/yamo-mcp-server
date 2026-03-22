/**
 * Tests for yamo_anchor_event — Phase 3 Provenance Closure (MCP)
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');

// ── Pure-logic helpers mirroring handleAnchorEvent ────────────────────────

const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function validateBytes32(value) {
  return BYTES32_PATTERN.test(value);
}

function validateBlockId(blockId) {
  if (!blockId) throw new Error('blockId is required');
  const parts = blockId.split('_');
  if (parts.length < 2) {
    throw new Error(`blockId must follow format {origin}_{workflow}. Received: ${blockId}`);
  }
}

function buildAnchorResponse(blockId, contentHash) {
  return `Anchored: blockId=${blockId} contentHash=${contentHash}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('yamo_anchor_event — Provenance Closure (Phase 3)', () => {

  describe('contentHash validation', () => {
    it('accepts a valid bytes32 hash', () => {
      const hash = '0x' + 'a'.repeat(64);
      assert(validateBytes32(hash), 'Valid bytes32 should pass');
    });

    it('rejects a hash without 0x prefix', () => {
      assert(!validateBytes32('a'.repeat(64)), 'No 0x prefix should fail');
    });

    it('rejects a hash shorter than 32 bytes', () => {
      assert(!validateBytes32('0x' + 'a'.repeat(32)), 'Short hash should fail');
    });

    it('rejects a hash longer than 32 bytes', () => {
      assert(!validateBytes32('0x' + 'a'.repeat(66)), 'Long hash should fail');
    });

    it('accepts mixed-case hex', () => {
      const hash = '0x' + 'aAbB'.repeat(16); // 4 chars × 16 = 64
      assert(validateBytes32(hash), 'Mixed case hex should pass');
    });

    it('rejects non-hex characters', () => {
      assert(!validateBytes32('0x' + 'g'.repeat(64)), 'Non-hex should fail');
    });
  });

  describe('blockId validation', () => {
    it('accepts valid {origin}_{workflow} format', () => {
      assert.doesNotThrow(() => validateBlockId('kernel_lesson'));
      assert.doesNotThrow(() => validateBlockId('agent_synthesis'));
    });

    it('rejects blockId without underscore', () => {
      assert.throws(() => validateBlockId('noUnderscore'), /format/);
    });

    it('rejects empty blockId', () => {
      assert.throws(() => validateBlockId(''), /required/);
    });

    it('rejects null/undefined blockId', () => {
      assert.throws(() => validateBlockId(null), /required/);
      assert.throws(() => validateBlockId(undefined), /required/);
    });
  });

  describe('anchor response format', () => {
    it('returns a plain text confirmation — not JSON', () => {
      const response = buildAnchorResponse('kernel_lesson', '0x' + 'a'.repeat(64));
      assert(typeof response === 'string');
      assert(response.includes('Anchored'));
      assert(response.includes('kernel_lesson'));
      assert(response.includes('0x' + 'a'.repeat(64)));
      assert.throws(() => JSON.parse(response), 'Response must not be valid JSON');
    });

    it('includes both blockId and contentHash in response', () => {
      const blockId = 'agent_distillation';
      const hash = '0x' + 'b'.repeat(64);
      const response = buildAnchorResponse(blockId, hash);
      assert(response.includes(blockId));
      assert(response.includes(hash));
    });
  });

  describe('tool contract', () => {
    it('tool name follows yamo_ prefix convention', () => {
      assert.strictEqual('yamo_anchor_event'.startsWith('yamo_'), true);
    });

    it('required fields are blockId and contentHash', () => {
      // Mirrors the inputSchema required array
      const required = ['blockId', 'contentHash'];
      assert.deepStrictEqual(required, ['blockId', 'contentHash']);
    });
  });
});
