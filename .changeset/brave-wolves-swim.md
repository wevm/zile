---
"zile": patch
---

Fixed bin object processing to support entries with `.src` suffix and entries already pointing to output directory. Also fixed `outDir` resolution from tsconfig to properly resolve relative paths. Added symlink creation for bin entries in link mode.
