# MCP Server Documentation Index

This directory contains comprehensive documentation for the YAMO MCP Server.

---

## 📚 Documentation Files

### Core Documentation

- **[README.md](./README.md)**
  - Installation instructions
  - Configuration guide
  - Tool reference (`yamo_submit_block`, `yamo_verify_block`)
  - Examples and usage

### Change History

- **[CHANGELOG.md](./CHANGELOG.md)**
  - Version history
  - Release notes
  - Migration guides
  - Breaking changes

### Fix Documentation

- **[FILE_BUNDLING_FIX.md](./FILE_BUNDLING_FIX.md)** 📖 *Detailed*
  - Complete analysis of the file bundling bug
  - Root cause explanation
  - Solution implementation details
  - Usage guide with examples
  - Testing procedures
  - Security considerations
  - Future enhancements

- **[QUICK_FIX_REFERENCE.md](./QUICK_FIX_REFERENCE.md)** ⚡ *Quick Reference*
  - One-page summary of the fix
  - How to use (3 methods)
  - Detection logic diagram
  - Quick test procedure
  - Common mistakes
  - Debugging tips

---

## 🔍 What to Read When

### "I just want to get started"
→ Start with **[README.md](./README.md)**

### "What changed in the latest version?"
→ Check **[CHANGELOG.md](./CHANGELOG.md)**

### "File paths aren't working"
→ See **[QUICK_FIX_REFERENCE.md](./QUICK_FIX_REFERENCE.md)**

### "I need to understand the bug fix in detail"
→ Read **[FILE_BUNDLING_FIX.md](./FILE_BUNDLING_FIX.md)**

### "How do I bundle files with my YAMO blocks?"
→ See examples in **[README.md](./README.md)** under "MCP Tools"

---

## 📋 Quick Links

| Topic | Document | Section |
|-------|----------|---------|
| Installation | README.md | "Installation" |
| Configuration | README.md | "Configuration" |
| Tool Parameters | README.md | "MCP Tools" |
| File Bundling Bug | FILE_BUNDLING_FIX.md | "Problem Description" |
| File Auto-Read Usage | QUICK_FIX_REFERENCE.md | "How to Use" |
| Version History | CHANGELOG.md | All |
| Migration Guide | CHANGELOG.md | "Migration Guide" |
| Security Warnings | FILE_BUNDLING_FIX.md | "Security Considerations" |

---

## 🐛 Known Issues & Fixes

### v1.0.0 (Current)

✅ **FIXED:** File paths uploaded as strings
- **Impact:** All users submitting bundles with file references
- **Fix:** Auto-read file paths (see FILE_BUNDLING_FIX.md)
- **Status:** Resolved in v1.0.0

### Future Enhancements

See **[FILE_BUNDLING_FIX.md](./FILE_BUNDLING_FIX.md)** → "Future Enhancements"

---

## 📝 Contributing to Documentation

When updating documentation:

1. **README.md** - User-facing features and usage
2. **CHANGELOG.md** - Version changes and migrations
3. **Fix docs** - Create separate detailed docs for major bug fixes
4. **Update this index** - Keep the index current

---

## 🔗 External Resources

- [YAMO Protocol GitHub](https://github.com/yamo-protocol)
- [MCP Server Repository](https://github.com/yamo-protocol/yamo-mcp-server)
- [Issue Tracker](https://github.com/yamo-protocol/yamo-mcp-server/issues)
- [YAMO Core Library](https://github.com/yamo-protocol/yamo-core)

---

**Last Updated:** January 2, 2026
**Documentation Version:** 1.0.0
