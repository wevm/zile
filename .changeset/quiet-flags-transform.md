---
'zile': patch
---

Added `package.json#zile.transform`, which names a module whose default export rewrites each emitted JavaScript file.

```js
export default (code, file) => code.replaceAll('process.env.DEBUG', 'false')
```
