const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { YamoMcpServer, validateBlockId, validateBytes32 } = require('../dist/index.js');

describe('YamoMcpServer Unit Tests', () => {
  let server;

  beforeEach(() => {
    // Set required environment variables for testing
    process.env.CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
    process.env.RPC_URL = 'http://localhost:8545';
    process.env.PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
    
    server = new YamoMcpServer();
  });

  it('should initialize with correct tool handlers', async () => {
    const toolNames = Object.keys(server.toolHandlers);
    
    assert.ok(toolNames.includes('yamo_submit_block'));
    assert.ok(toolNames.includes('yamo_get_block'));
    assert.ok(toolNames.includes('yamo_get_latest_block'));
    assert.ok(toolNames.includes('yamo_audit_block'));
    assert.ok(toolNames.includes('yamo_verify_block'));
    assert.ok(toolNames.includes('yamo_recall_lessons'));
    assert.ok(toolNames.includes('yamo_anchor_event'));
  });

  it('should validate blockId format', () => {
    assert.doesNotThrow(() => validateBlockId('origin_workflow'));
    assert.throws(() => validateBlockId('no-underscore'), /blockId must follow format/);
    assert.throws(() => validateBlockId(''), /blockId is required/);
  });

  it('should validate bytes32 format', () => {
    const validHash = '0x' + 'a'.repeat(64);
    assert.doesNotThrow(() => validateBytes32(validHash, 'testField'));
    assert.throws(() => validateBytes32('0x123', 'testField'), /must be a valid bytes32 hash/);
  });
});
