<p align="center">
  <a href="https://wagmi.sh">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/wevm/zile/main/.github/lockup-dark.svg">
      <img alt="zile logo" src="https://raw.githubusercontent.com/wevm/zile/main/.github/lockup-light.svg" width="auto" height="60">
    </picture>
  </a>
</p>

<p align="center">
  Opinionated build tool for TypeScript libraries, powered by <code>tsc</code> (or <code>tsgo</code>!).
<p>

<p align="center">
  <a href="https://github.com/wevm/zile/blob/main/LICENSE">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/zile?colorA=21262d&colorB=21262d">
      <img src="https://img.shields.io/npm/l/zile?colorA=f6f8fa&colorB=f6f8fa" alt="MIT License">
    </picture>
  </a>
  <a href="https://www.npmjs.com/package/zile">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/zile?colorA=21262d&colorB=21262d">
      <img src="https://img.shields.io/npm/dm/zile?colorA=f6f8fa&colorB=f6f8fa" alt="Downloads per month">
    </picture>
  </a>
</p>

---

## Getting Started

### 1. Install

```sh
npm i zile typescript -D
```

### 2. Add Entrypoints

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

#### Binary/CLI Entrypoint(s)

A binary entrypoint can be specified as the `bin` field pointing to your source file.

```diff
{
  "name": "my-pkg",
  "version": "0.0.0",
  "type": "module",
+ "bin": "./src/cli.ts"
}
```

Or if you want to specify a custom name for the binary, or multiple binary entrypoints, you can use the `bin` field as an object.

```diff
{
  "name": "my-pkg",
  "version": "0.0.0",
  "type": "module",
+ "bin": {
+   "foo.src": "./src/cli.ts"
+   "bar.src": "./src/cli2.ts"
+ }
}
```

> Make sure you add a `.src` suffix and the value is pointing to your source file. The `bin` will be remapped to the built file in your output when you run `zile`.

### 3. Run Zile

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

