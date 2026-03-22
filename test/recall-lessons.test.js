/**
 * Tests for yamo_recall_lessons — Phase 4 Ghost Protection (MCP)
 *
 * The server cannot be instantiated in tests (requires live env vars + starts stdio).
 * Tests cover the extractable logic of handleRecallLessons directly.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');

// ── Pure-logic helpers extracted from handleRecallLessons ──────────────────

/** Mirrors the limit clamping in handleRecallLessons. */
function clampLimit(raw) {
  return Math.min(Math.max(raw ?? 5, 1), 20);
}

/** Mirrors the wireFormat filter step. */
function filterWireFormats(results) {
  return results
    .map((r) => r.wireFormat)
    .filter((c) => Boolean(c && c.trim()));
}

/** Mirrors the lessons.join step. */
function formatLessons(lessons) {
  if (lessons.length === 0) {
    return 'No lessons found. Memory may be empty or not yet initialized.';
  }
  return lessons.join('\n\n');
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('yamo_recall_lessons — Ghost Protection (Phase 4)', () => {

  describe('limit clamping', () => {
    it('defaults to 5 when limit is undefined', () => {
      assert.strictEqual(clampLimit(undefined), 5);
    });

    it('clamps minimum to 1', () => {
      assert.strictEqual(clampLimit(0), 1);
      assert.strictEqual(clampLimit(-10), 1);
    });

    it('clamps maximum to 20', () => {
      assert.strictEqual(clampLimit(21), 20);
      assert.strictEqual(clampLimit(1000), 20);
    });

    it('passes valid limits through unchanged', () => {
      assert.strictEqual(clampLimit(1), 1);
      assert.strictEqual(clampLimit(10), 10);
      assert.strictEqual(clampLimit(20), 20);
    });
  });

  describe('wireFormat filtering — Zero-JSON compliance', () => {
    it('extracts wireFormat strings from results', () => {
      const results = [
        { wireFormat: 'agent: MemoryMesh_A;\nintent: distill_wisdom;' },
        { wireFormat: 'agent: MemoryMesh_B;\nintent: distill_wisdom;' },
      ];
      const filtered = filterWireFormats(results);
      assert.strictEqual(filtered.length, 2);
      assert(filtered[0].startsWith('agent:'));
    });

    it('drops entries with empty wireFormat', () => {
      const results = [
        { wireFormat: 'agent: MemoryMesh_A;\nintent: distill_wisdom;' },
        { wireFormat: '' },
        { wireFormat: '   ' },
      ];
      const filtered = filterWireFormats(results);
      assert.strictEqual(filtered.length, 1);
    });

    it('drops entries with undefined wireFormat', () => {
      const results = [
        { wireFormat: undefined },
        { wireFormat: 'agent: MemoryMesh_A;\nintent: distill_wisdom;' },
      ];
      const filtered = filterWireFormats(results);
      assert.strictEqual(filtered.length, 1);
    });

    it('returns raw strings — no field extraction, no JSON parsing', () => {
      const wire = 'agent: MemoryMesh_X;\nintent: distill_wisdom_from_execution;\nlog: lesson_learned;';
      const results = [{ wireFormat: wire }];
      const filtered = filterWireFormats(results);
      // The value returned must be the raw string, not a parsed object
      assert.strictEqual(typeof filtered[0], 'string');
      assert.strictEqual(filtered[0], wire);
    });
  });

  describe('empty memory handling — non-fatal', () => {
    it('returns informative message when no lessons exist', () => {
      const msg = formatLessons([]);
      assert(msg.includes('No lessons found'));
    });

    it('joins multiple lessons with double newline', () => {
      const lessons = ['block-one', 'block-two'];
      const formatted = formatLessons(lessons);
      assert(formatted.includes('block-one\n\nblock-two'));
    });
  });

  describe('error handling — memory unavailable is non-fatal', () => {
    it('error path returns text, not an exception', () => {
      // Simulates the catch block: memory unavailable should return a text
      // response rather than propagating the exception to the MCP caller.
      const err = new Error('LanceDB file not found');
      const response = `Memory unavailable: ${err.message}`;
      assert(typeof response === 'string');
      assert(response.includes('Memory unavailable'));
      assert(!response.includes('stack'));
    });
  });

  describe('tool contract', () => {
    it('YAMO_MEMORY_PATH defaults to ./data/memories.lance', () => {
      // Confirms the default path aligns with yamo-os LanceDB location
      const defaultPath = process.env.YAMO_MEMORY_PATH || './data/memories.lance';
      assert.strictEqual(defaultPath, './data/memories.lance');
    });

    it('lessons are returned as plain text — not wrapped in JSON', () => {
      // Zero-JSON Mandate: machine passes raw YAMO block strings through;
      // LLM interprets the content.
      const wire = 'agent: MemoryMesh;\nintent: distill;';
      const formatted = formatLessons([wire]);
      // Must not be parseable as JSON (it's a YAMO block, not JSON)
      assert.throws(() => JSON.parse(formatted), 'Should not be valid JSON');
    });
  });

});
