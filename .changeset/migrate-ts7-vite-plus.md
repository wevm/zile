---
"zile": patch
---

Migrated the repository from Biome and Vitest to Vite+ (Oxlint, Oxfmt, Vitest 4), and from TypeScript 5 to TypeScript 7. JSDoc example checking (`zile examples:check`, `zile build --check-examples`) now uses the TypeScript 7 `typescript/unstable/ast` scanner and requires `typescript@>=7` to be installed; it is loaded lazily so the rest of the CLI keeps working without TypeScript installed.
