---
"zile": patch
---

Fixed `readPackageJson` to strip pre-marker keys so all publish paths (including `pkg.pr.new`) produce a clean `package.json` without monorepo-only fields.
