---
'zile': patch
---

Added `package.json#zile.define`, which names a module whose replacements Zile applies to the emitted JavaScript and removes the imports they leave unused.

```json
"zile": { "define": "./define.js" }
```
