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

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [`package.json` Reference](#packagejson-reference)
- [`tsconfig.json` Reference](#tsconfigjson-reference)
- [CLI Reference](#cli-reference)
- [License](#license)

## Overview

Zile is an opinionated zero-config tool for transpiling TypeScript libraries based on your `package.json` file, powered by `tsc`.

- **Zero-config**: No config files or specific config to get started – relies on standard `package.json` fields
- **ESM-only**: Builds libraries with pure-ESM output
- **Development mode**: `zile dev` creates symlinks for rapid development without full transpilation
- **Support for `tsgo`**: Use `tsgo` for faster transpilation
- **Binary/CLI Support**: Supports CLI tools with automatic handling of `package.json#bin`
- **Auto-generated `package.json`**: Zile will auto-generate a valid `package.json` file to distribute to package registries

## Getting Started

### 1. Install

Install Zile as a dev dependency on your project, and ensure that `typescript` is also installed.

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

This section describes how Zile transforms your `package.json` fields during the build process.

### `main`

The `main` field specifies a single entrypoint for your package.

Point to your source file:

```diff
{
  "name": "my-pkg",
  "version": "0.0.0",
  "type": "module",
+ "main": "./src/index.ts"
}
```

> **↓↓↓ Output**
> >
> Zile transforms this to point to the built file and generates `exports`, `module` and `types` fields:
> ```json
> {
>   "main": "./dist/index.js",
>   "module": "./dist/index.js",
>   "types": "./dist/index.d.ts",
>   "exports": {
>     ".": {
>       "src": "./src/index.ts",
>       "types": "./dist/index.d.ts",
>       "default": "./dist/index.js"
>     }
>   }
> }
> ```

### `exports`

The `exports` field enables you to specify multiple (or single) entrypoints for your package.

Point to your source files directly:

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

> **↓↓↓ Output**
> 
>Zile expands each entrypoint to include types and built files:
>
> ```json
> {
>   "name": "my-pkg",
>   "version": "0.0.0",
>   "type": "module",
>   "main": "./dist/index.js",
>   "module": "./dist/index.js",
>   "types": "./dist/index.d.ts",
>   "exports": {
>     ".": {
>       "src": "./src/index.ts",
>       "types": "./dist/index.d.ts",
>       "default": "./dist/index.js"
>     },
>     "./utils": {
>       "src": "./src/utils.ts",
>       "types": "./dist/utils.d.ts",
>       "default": "./dist/utils.js"
>     }
>   }
> }
> ```

### `bin`

The `bin` field specifies CLI entrypoints for your package.

#### String Format (Single Binary)

Point to your source file:

```diff
{
  "name": "my-cli",
  "version": "0.0.0",
  "type": "module",
+ "bin": "./src/cli.ts"
}
```

> **↓↓↓ Output**
> 
> Zile creates both the built binary and preserves a `.src` reference:
> 
> ```json
> {
>   "name": "my-cli",
>   "bin": {
>     "my-cli": "./dist/cli.js",
>     "my-cli.src": "./src/cli.ts"
>   }
> }
> ```

#### Object Format (Multiple Binaries)

Use keys with `.src` suffix to indicate source files:

```diff
{
  "name": "my-cli",
  "version": "0.0.0",
  "type": "module",
+ "bin": {
+   "foo.src": "./src/cli-foo.ts",
+   "bar.src": "./src/cli-bar.ts"
+ }
}
```

> **↓↓↓ Output**
> 
> Zile creates built versions without the `.src` suffix:
> 
> ```json
> {
>   "name": "my-cli",
>   "version": "0.0.0",
>   "type": "module",
>   "bin": {
>     "foo": "./dist/cli-foo.js",
>     "foo.src": "./src/cli-foo.ts",
>     "bar": "./dist/cli-bar.js",
>     "bar.src": "./src/cli-bar.ts"
>   }
> }
> ```

### Additional Fields

Zile also sets these fields if not already present:

- **`type`**: Set to `"module"` (ESM-only)
- **`sideEffects`**: Set to `false`

## `tsconfig.json` Reference

Since `tsc` is used under the hood, Zile also uses fields in your `tsconfig.json` file to determine the output directory and particular settings for transpilation.

Any field in the `tsconfig.json` can be modified, and the following fields are worth noting:

- **`outDir`**: Output directory. Defaults to `./dist`
- **`target`**: Target ES version. Defaults to `es2021`

The following fields cannot be modified, and are overridden by Zile:

- **`composite`**: Set to `false` to disable project references and incremental compilation, and allow for purity.
- **`declaration`**: Set to `true` as we always want to emit declaration files.
- **`declarationMap`**: Set to `true` to emit source maps for declaration files.
- **`emitDeclarationOnly`**: Set to `false` to force emitting built files.
- **`esModuleInterop`**: Set to `true` to enable interoperability between CommonJS and ES modules.
- **`noEmit`**: Set to `false` to force emitting built files.
- **`skipLibCheck`**: Set to `true` to skip type checking of external libraries.
- **`sourceMap`**: Set to `true` to emit source maps.

## CLI Reference

```sh
zile/0.0.0

Usage:
  $ zile [root]

Commands:
  [root]  
  build   Build package
  dev     Resolve package exports to source for development

For more info, run any command with the `--help` flag:
  $ zile --help
  $ zile build --help
  $ zile dev --help

Options:
  --cwd <directory>         Working directory to build 
  --includes <patterns...>  Glob patterns to include 
  --project <path>          Path to tsconfig.json file, relative to the working directory. 
  --tsgo                    Use tsgo for transpilation 
  -v, --version             Display version number 
  -h, --help                Display this message
```

## License

[MIT](./LICENSE) License.

