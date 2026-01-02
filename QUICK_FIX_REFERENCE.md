# Quick Fix Reference: File Bundling Auto-Read

**Version:** 1.0.0 | **Date:** January 2, 2026

---

## What Was Fixed?

File paths in the `files` parameter were being uploaded to IPFS as literal strings instead of reading the actual file contents.

## The Fix

The MCP server now automatically detects file paths and reads them.

---

## How to Use

### Option 1: File Paths (Recommended)

```json
{
  "files": [
    {"name": "output.json", "content": "/path/to/output.json"}
  ]
}
```

✅ Server automatically reads `/path/to/output.json` and uploads its contents

### Option 2: Inline Content

```json
{
  "files": [
    {"name": "output.json", "content": "{\"result\": \"success\"}"}
  ]
}
```

✅ Server uploads the literal JSON string

### Option 3: Mixed

```json
{
  "files": [
    {"name": "metadata.json", "content": "{\"id\": 1}"},
    {"name": "data.csv", "content": "/workspace/data.csv"}
  ]
}
```

✅ First file uses inline content, second reads from path

---

## Detection Logic

```
Is file.content a string?
  ├─ YES → Does a file exist at that path?
  │         ├─ YES → Read file contents ✅
  │         └─ NO  → Use string as-is ⚠️
  └─ NO  → Use as-is
```

---

## Quick Test

```bash
# 1. Create test file
echo '{"test": "data"}' > /tmp/test.json

# 2. Call MCP tool with file path
{
  "files": [{"name": "test.json", "content": "/tmp/test.json"}]
}

# 3. Verify IPFS contains: {"test": "data"}
# NOT: "/tmp/test.json"
```

---

## Debugging

Check MCP server logs (stderr):

```bash
Auto-reading file from path: /tmp/test.json
```

If you see this message ✅ = file was read

If you don't see it ⚠️ = path wasn't detected (check if file exists)

---

## Common Mistakes

❌ **Relative paths from wrong directory:**
```json
{"content": "./output.json"}  // May not exist relative to MCP server
```

✅ **Use absolute paths:**
```json
{"content": "/home/user/workspace/output.json"}
```

---

❌ **Passing file objects:**
```json
{"content": fileObject}  // Not a string
```

✅ **Pass path string:**
```json
{"content": "/path/to/file"}
```

---

## Security Warning

⚠️ The server will read **ANY** file path you provide:
- System files: `/etc/passwd`
- Private keys: `~/.ssh/id_rsa`
- Secrets: `.env`

**Best practice:** Run MCP server with limited filesystem permissions

---

## Files Changed

1. `src/index.ts` - Added auto-read logic
2. `package.json` - Added MCP SDK dependency
3. `README.md` - Updated documentation
4. `FILE_BUNDLING_FIX.md` - Detailed fix documentation
5. `CHANGELOG.md` - Version history

---

## Support

- **Detailed docs:** See `FILE_BUNDLING_FIX.md`
- **Issues:** https://github.com/yamo-protocol/yamo-mcp-server/issues
- **Version:** Check with `npm list @yamo/mcp-server`

---

**Status:** ✅ Fixed in v1.0.0
