---
'zile': patch
---

Fixed a race where a concurrent reader, such as pnpm linking workspace projects, could read an empty `package.json` while `zile dev` or `zile build` rewrote it. An unchanged manifest is no longer written, and a changed one replaces the file in one rename.
