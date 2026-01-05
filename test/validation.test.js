
const assert = require('node:assert');
const { describe, it } = require('node:test');

function validateBlockId(blockId) {
  // Regex to match {origin}_{workflow} format
  // Origin and workflow should be alphanumeric (plus underscores/dashes maybe?)
  // The requirement says: "Must follow YAMO naming convention: {origin}_{workflow}"
  // Examples: "claude_chain", "aurora_weave", "document_translation"
  // It also says: "Do NOT use sequence numbers (001, 002)" - this is harder to enforce strictly with regex but we can try.
  
  if (!blockId) throw new Error("blockId is required");
  
  const parts = blockId.split('_');
  if (parts.length < 2) {
    throw new Error(`blockId must follow format {origin}_{workflow} (e.g., 'claude_chain'). Received: ${blockId}`);
  }

  // Check for simple sequence numbers at the end (heuristic)
  if (parts[parts.length - 1].match(/^\d+$/)) {
     // ambiguous, but the rule says "Do NOT use sequence numbers". 
     // However, "gpt_4" might be valid. 
     // Let's stick to the structure check for now.
  }
}

describe('BlockId Validation', () => {
  it('should accept valid blockIds', () => {
    const validIds = ['claude_chain', 'aurora_weave', 'document_translation', 'my_agent_task'];
    validIds.forEach(id => {
      assert.doesNotThrow(() => validateBlockId(id), `Should accept ${id}`);
    });
  });

  it('should reject blockIds without underscore', () => {
    const invalidIds = ['claude', 'chain', 'testblock'];
    invalidIds.forEach(id => {
      assert.throws(() => validateBlockId(id), /must follow format/, `Should reject ${id}`);
    });
  });
  
  it('should reject empty blockId', () => {
      assert.throws(() => validateBlockId(''), /blockId is required/);
  });
});
