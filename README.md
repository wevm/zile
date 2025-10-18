# Zile

Opinionated build tool for TypeScript libraries.

## Getting Started

### 1. Add Entrypoints

Zile does not require specific configuration. However, it does require a few fields in your `package.json` file to be present depending if you have a single or multiple entrypoints.

#### Single Entrypoint

A single entrypoint can be specified as the `main` field pointing to your source file.

```diff
{
  "name": "my-pkg",
  "version": "0.0.0",
  "type": "module",
+ "main": "./src/index.ts"
}
```

> The `main` entry will be remapped to the built file in your output when you run `zile`.

#### Multiple Entrypoints

Multiple entrypoints can be specified as the `exports` field pointing to your source files.

```diff

{
  "name": "my-pkg",
  "version": "0.0.0",
  "type": "module",
+ "exports": {
+   ".": "./src/index.ts",
+   "./utils": "./src/utils.ts"
+ }
}
```

> The `exports` will be remapped to the built files in your output when you run `zile`.

### 2. Run Zile

Add a `build` script to your `package.json` file, and run it with `npm run build`.

```diff
{
  "name": "my-pkg",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts"
+ "scripts": {
+   "build": "zile"
+ },
  ...
}
```

```sh
npm run build
```

## `package.json` Reference

TODO

## CLI Reference

TODO

## License

[MIT](./LICENSE) License.

