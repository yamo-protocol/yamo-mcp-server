# Changelog

All notable changes to the YAMO MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-02

### Added
- **Auto-read file paths in `files` parameter**: The `yamo_submit_block` tool now automatically detects when `file.content` is a file path and reads the file contents. This makes it consistent with the CLI behavior and simplifies agent code.
- Documentation for dual-mode file content (inline vs. file paths)
- Detailed fix documentation in `FILE_BUNDLING_FIX.md`

### Changed
- Server name changed from "yamo-chain-mcp" to "yamo" for consistency
- Version bumped to 1.0.0 (stable release)
- Updated README with comprehensive examples of both inline content and file path methods

### Fixed
- **Critical bug**: File paths were being uploaded as literal strings instead of file contents
  - Root cause: MCP server didn't distinguish between inline content and file paths
  - Solution: Added `fs.existsSync()` check and automatic file reading
  - Impact: All users submitting bundles with file references
  - See `FILE_BUNDLING_FIX.md` for detailed information

### Technical Details
- Added `import fs from "fs"` to enable filesystem access
- Implemented smart detection: if `content` is a valid file path, read it; otherwise use as-is
- Added console logging: "Auto-reading file from path: /path/to/file" for debugging
- Backward compatible: existing inline content usage continues to work

### Security Notes
- ⚠️ Server can now read any file path provided by the agent
- Recommendation: Run MCP server with limited filesystem permissions
- Recommendation: Validate file paths in agent code before submission
- Future: Consider adding path whitelist configuration

## [0.5.0] - 2025-12-XX (Pre-release)

### Added
- Initial MCP server implementation
- `yamo_submit_block` tool for blockchain submission
- `yamo_verify_block` tool for integrity verification
- IPFS deep bundling support
- Integration with @yamo/core library

### Known Issues (Fixed in 1.0.0)
- File paths uploaded as strings (see 1.0.0 fix above)

---

## Migration Guide

### Upgrading from 0.5.0 to 1.0.0

**No breaking changes** - all existing code continues to work.

**New feature available:**

```javascript
// OLD WAY (still works):
const content = fs.readFileSync('/path/to/file.json', 'utf8');
await mcpTool('yamo_submit_block', {
  files: [{ name: 'file.json', content: content }]
});

// NEW WAY (simpler):
await mcpTool('yamo_submit_block', {
  files: [{ name: 'file.json', content: '/path/to/file.json' }]
});
```

**If you experienced the file path bug:**

Simply update to v1.0.0 and resubmit your blocks. The file contents will now be properly uploaded to IPFS.

---

## Links

- [GitHub Repository](https://github.com/yamo-protocol/yamo-mcp-server)
- [Issue Tracker](https://github.com/yamo-protocol/yamo-mcp-server/issues)
- [YAMO Protocol Documentation](https://github.com/yamo-protocol)
