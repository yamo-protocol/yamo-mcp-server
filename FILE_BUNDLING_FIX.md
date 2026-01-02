# MCP Server File Bundling Fix

**Date:** January 2, 2026
**Version:** 1.0.0
**Issue:** File paths uploaded as strings instead of file contents

---

## Problem Description

When using the `yamo_submit_block` MCP tool with the `files` parameter, users experienced an issue where file paths were uploaded to IPFS as literal strings instead of the actual file contents.

### Example of the Bug

**What the user did:**
```json
{
  "blockId": "block_001",
  "files": [
    {
      "name": "output.json",
      "content": "/path/to/output.json"
    }
  ]
}
```

**What happened:**
- IPFS bundle contained a file named `output.json`
- File content was the literal string: `"/path/to/output.json"`
- Not the actual JSON data from the file

**What should have happened:**
- IPFS bundle should contain `output.json` with the actual file contents
- Like: `{"result": "success", "data": [...]}`

---

## Root Cause

The MCP server's `yamo_submit_block` tool accepted the `files` parameter but did not distinguish between:
1. **Inline content** - actual file content passed as a string
2. **File paths** - paths to files that should be read from disk

Unlike the CLI (which always reads from disk), the MCP server passed the `content` field directly to the IPFS upload without checking if it was a file path.

**Code before fix (simplified):**
```typescript
if (content) {
  ipfsCID = await this.ipfs.upload({
    content,
    files: files  // Passed as-is, no file reading
  });
}
```

---

## Solution Implemented

### Changes Made

1. **Added filesystem access:**
   ```typescript
   import fs from "fs";
   ```

2. **Implemented auto-detection and reading:**
   ```typescript
   // Process files - auto-read if they're file paths
   let processedFiles = files;
   if (files && Array.isArray(files)) {
     processedFiles = files.map((file: any) => {
       // Check if content is a file path that exists
       if (typeof file.content === 'string' && fs.existsSync(file.content)) {
         console.error(`Auto-reading file from path: ${file.content}`);
         return {
           name: file.name,
           content: fs.readFileSync(file.content, 'utf8')
         };
       }
       // Otherwise use content as-is
       return file;
     });
   }
   ```

3. **Updated tool description:**
   ```typescript
   description: "Optional: Array of output files to bundle. Each file's 'content' can be either the actual file content (string) or a file path (will be auto-read)."
   ```

### How It Works

The server now checks each file's `content` field:
1. **Is it a string?** ✓
2. **Does a file exist at that path?**
   - **YES** → Read the file with `fs.readFileSync()` and use that content
   - **NO** → Treat it as inline content (use the string as-is)

This makes the MCP server consistent with the CLI's behavior.

---

## Usage Guide

### Method 1: Inline Content (Original Method)

Pass the actual file content as a string:

```json
{
  "blockId": "block_001",
  "content": "agent: MyAgent;\nintent: test;",
  "files": [
    {
      "name": "output.json",
      "content": "{\"result\": \"success\", \"value\": 42}"
    },
    {
      "name": "analysis.txt",
      "content": "Analysis complete.\nConfidence: 95%"
    }
  ]
}
```

**Pros:**
- No filesystem access needed
- Works with dynamically generated content
- No file path dependencies

**Cons:**
- Must escape quotes in JSON strings
- Large files clutter the tool call

---

### Method 2: File Paths (NEW - Auto-Read)

Pass file paths - the server will read them automatically:

```json
{
  "blockId": "block_002",
  "content": "agent: MyAgent;\nintent: analyze;",
  "files": [
    {
      "name": "output.json",
      "content": "/home/user/workspace/output.json"
    },
    {
      "name": "analysis.txt",
      "content": "/home/user/workspace/analysis.txt"
    }
  ]
}
```

**Pros:**
- Clean, readable tool calls
- Easy to work with existing files
- No need to read files manually in agent code

**Cons:**
- Requires files to exist on disk
- File paths must be absolute or relative to MCP server's working directory

---

### Method 3: Mixed (Both Methods)

You can mix inline content and file paths:

```json
{
  "blockId": "block_003",
  "content": "agent: MyAgent;\nintent: mixed;",
  "files": [
    {
      "name": "metadata.json",
      "content": "{\"generated\": true}"
    },
    {
      "name": "data.csv",
      "content": "/home/user/data/results.csv"
    }
  ]
}
```

---

## Migration Guide

### For AI Agents Using the MCP Server

**Before (Manual File Reading):**
```typescript
// Agent had to read files before calling tool
const outputContent = await readFile('/path/to/output.json');
const analysisContent = await readFile('/path/to/analysis.txt');

await callMcpTool('yamo_submit_block', {
  blockId: 'block_001',
  files: [
    { name: 'output.json', content: outputContent },
    { name: 'analysis.txt', content: analysisContent }
  ]
});
```

**After (Simplified - File Paths):**
```typescript
// Agent can pass paths directly
await callMcpTool('yamo_submit_block', {
  blockId: 'block_001',
  files: [
    { name: 'output.json', content: '/path/to/output.json' },
    { name: 'analysis.txt', content: '/path/to/analysis.txt' }
  ]
});
```

**Both methods still work!** Use whichever fits your use case.

---

## Testing the Fix

### Test 1: File Path (New Feature)

1. Create a test file:
   ```bash
   echo '{"test": "data"}' > /tmp/test.json
   ```

2. Call MCP tool:
   ```json
   {
     "blockId": "test_001",
     "previousBlock": "genesis",
     "contentHash": "0xabc...",
     "consensusType": "single_agent",
     "ledger": "test",
     "content": "agent: TestAgent;\nintent: test;",
     "files": [
       {
         "name": "test.json",
         "content": "/tmp/test.json"
       }
     ]
   }
   ```

3. Verify IPFS bundle contains `{"test": "data"}`, not `"/tmp/test.json"`

### Test 2: Inline Content (Original Method)

```json
{
  "blockId": "test_002",
  "files": [
    {
      "name": "inline.json",
      "content": "{\"inline\": true}"
    }
  ]
}
```

Verify IPFS bundle contains `{"inline": true}`

### Test 3: Non-Existent Path (Fallback)

```json
{
  "blockId": "test_003",
  "files": [
    {
      "name": "fake.txt",
      "content": "/this/does/not/exist.txt"
    }
  ]
}
```

Verify IPFS bundle contains the literal string `/this/does/not/exist.txt` (fallback to inline content)

---

## Files Modified

### 1. `/tmp/yamo-migration/yamo-mcp-server/src/index.ts`
- Added `import fs from "fs";`
- Added file path detection and auto-read logic (lines 73-88)
- Updated tool description for `files` parameter

### 2. `/tmp/yamo-migration/yamo-mcp-server/package.json`
- Added `@modelcontextprotocol/sdk` dependency
- Updated `@yamo/core` to use GitHub dependency

### 3. `/tmp/yamo-migration/yamo-mcp-server/README.md`
- Updated `yamo_submit_block` documentation
- Added examples for both inline content and file paths
- Documented the dual-mode behavior

### 4. `/home/dev/yamo-v1.0-release/packages/mcp-server/*`
- Applied same changes to main repository
- Ensured consistency across both codebases

---

## Debugging

### Check if file path was detected:

When the MCP server runs, it logs to stderr:

```bash
Auto-reading file from path: /path/to/your/file.json
```

If you see this message, the file was successfully detected and read.

### Common Issues

**Issue:** File path not being read (uploaded as string)

**Possible causes:**
1. File doesn't exist at that path
2. MCP server doesn't have permission to read the file
3. Path is relative, but server's working directory is different

**Solution:** Use absolute paths or check file permissions

---

**Issue:** "ENOENT: no such file or directory"

**Cause:** File path is incorrect or file was deleted

**Solution:** Verify file exists before calling the tool

---

## Compatibility

- **Backward Compatible:** ✅ Yes
  - Existing tool calls with inline content still work
  - No breaking changes

- **Forward Compatible:** ✅ Yes
  - New file path feature is optional
  - Clients can upgrade without code changes

---

## Performance Considerations

- **File Reading:** Synchronous (`fs.readFileSync`)
  - Blocks the event loop while reading
  - Acceptable for small-to-medium files (<10MB)
  - For large files, consider pre-reading in agent code

- **Memory Usage:**
  - Files are read into memory before upload
  - Multiple large files may cause memory pressure
  - Consider file size when bundling

---

## Security Considerations

⚠️ **Path Traversal Risk:**

The server will read ANY file path provided, including:
- System files: `/etc/passwd`
- Private keys: `~/.ssh/id_rsa`
- Environment files: `.env`

**Mitigation:**
1. MCP server should run with limited filesystem permissions
2. AI agents should validate file paths before submission
3. Consider adding a whitelist of allowed directories (future enhancement)

⚠️ **Information Disclosure:**

If an agent is compromised or malicious, it could read sensitive files and upload them to public IPFS.

**Best Practices:**
1. Run MCP server in a sandboxed environment
2. Use filesystem permissions to restrict access
3. Audit file paths before submission
4. Don't run MCP server as root

---

## Future Enhancements

Potential improvements for future versions:

1. **Async File Reading:**
   - Use `fs.promises.readFile()` instead of `fs.readFileSync()`
   - Prevent blocking on large files

2. **Path Whitelist:**
   - Configuration option to restrict allowed paths
   - Example: `allowedPaths: ["/workspace", "/tmp"]`

3. **Binary File Support:**
   - Currently reads as UTF-8 text only
   - Could detect binary files and read as Buffer

4. **Glob Patterns:**
   - Allow wildcards: `"content": "/workspace/*.json"`
   - Auto-bundle all matching files

5. **Compression:**
   - Compress large files before upload
   - Save IPFS storage and bandwidth

---

## Version History

### v1.0.0 (January 2, 2026)
- ✅ Added auto-read file path support
- ✅ Maintained backward compatibility with inline content
- ✅ Updated documentation and examples
- ✅ Fixed server name from "yamo-chain-mcp" to "yamo"

---

## Support

If you encounter issues with file bundling:

1. Check the MCP server logs (stderr) for "Auto-reading file from path" messages
2. Verify file paths are absolute and accessible
3. Test with inline content first to isolate the issue
4. Report bugs at: https://github.com/yamo-protocol/yamo-mcp-server/issues

---

**Document Version:** 1.0
**Last Updated:** January 2, 2026
**Status:** ✅ Fixed and Deployed
