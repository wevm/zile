import * as cp from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as Tsconfig from 'tsconfck'
import type { PackageJson, TsConfigJson } from 'type-fest'

export type { PackageJson, TsConfigJson }

/**
 * Builds a package.
 *
 * @param options - Options for building a package
 * @returns Build artifacts.
 */
export async function build(options: build.Options): Promise<build.ReturnType> {
  const { cwd = process.cwd() } = options

  const pkgJson = await readPackageJson({ cwd })
  const entries = getEntries({ cwd, pkgJson })
  const { tsConfig } = await transpile({ cwd, entries })
  const packageJson = await decoratePackageJson(pkgJson, { cwd, tsConfig })
  await writePackageJson(cwd, packageJson)

  return { packageJson, tsConfig }
}

export declare namespace build {
  type Options = {
    /** Working directory to start searching from. @default process.cwd() */
    cwd?: string | undefined
  }

  type ReturnType = {
    /** Transformed package.json file. */
    packageJson: PackageJson
    /** tsconfig.json used for transpilation. */
    tsConfig: TsConfigJson
  }
}

export async function check(options: check.Options): Promise<check.ReturnType> {
  const { cwd = process.cwd() } = options
  const [attw, publint] = await Promise.all([checkAttw({ cwd }), checkPublint({ cwd })])
  return { output: { attw: attw.output, publint: publint.output } }
}

export declare namespace check {
  type Options = {
    /** Working directory to check. @default process.cwd() */
    cwd?: string | undefined
  }

  type ReturnType = {
    /** Check results. */
    output: {
      /** ATTW CLI output as a string. */
      attw: string
      /** Publint CLI output as a string. */
      publint: string
    }
  }
}

/**
 * Checks if the package is properly typed using @arethetypeswrong/cli.
 *
 * @param options - Options for checking a package.
 * @returns CLI output as a string.
 */
export async function checkAttw(options: checkAttw.Options): Promise<checkAttw.ReturnType> {
  const { cwd = process.cwd() } = options

  const attw = path.resolve(import.meta.dirname, '..', 'node_modules', '.bin', 'attw')
  const child = cp.spawn(
    attw,
    ['--pack', '.', '--format', 'table-flipped', '--profile', 'esm-only'],
    {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
    },
  )

  const promise = Promise.withResolvers<checkAttw.ReturnType>()
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []

  child.stdout.on('data', (data: Buffer) => {
    stdout.push(data)
  })
  child.stderr.on('data', (data: Buffer) => {
    stderr.push(data)
  })
  child.on('close', (code) => {
    const output = Buffer.concat(stdout).toString()
    const error = Buffer.concat(stderr).toString()
    if (code === 0) promise.resolve({ output })
    else promise.reject(new Error(`attw exited with code ${code}\n${error}`))
  })
  child.on('error', promise.reject)

  return await promise.promise
}

export declare namespace checkAttw {
  type Options = {
    /** Working directory to check. @default process.cwd() */
    cwd?: string | undefined
  }

  type ReturnType = {
    /** CLI output as a string. */
    output: string
  }
}

/**
 * Checks the package using publint CLI.
 *
 * @param options - Options for checking a package.
 * @returns CLI output as a string.
 */
export async function checkPublint(
  options: checkPublint.Options,
): Promise<checkPublint.ReturnType> {
  const { cwd = process.cwd() } = options

  const publint = path.resolve(import.meta.dirname, '..', 'node_modules', '.bin', 'publint')
  const child = cp.spawn(publint, ['--strict'], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
  })

  const promise = Promise.withResolvers<checkPublint.ReturnType>()
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []

  child.stdout.on('data', (data: Buffer) => {
    stdout.push(data)
  })
  child.stderr.on('data', (data: Buffer) => {
    stderr.push(data)
  })
  child.on('close', (code) => {
    const output = Buffer.concat(stdout).toString()
    const error = Buffer.concat(stderr).toString()
    if (code === 0) promise.resolve({ output })
    else promise.reject(new Error(`publint exited with code ${code}\n${error}`))
  })
  child.on('error', promise.reject)

  return await promise.promise
}

export declare namespace checkPublint {
  type Options = {
    /** Working directory to check. @default process.cwd() */
    cwd?: string | undefined
  }

  type ReturnType = {
    /** CLI output as a string. */
    output: string
  }
}

/**
 * Decorates the package.json file to include publish-specific fields.
 *
 * @param pkgJson - Package.json file to transform.
 * @param options - Options.
 * @returns Transformed package.json file as an object.
 */
export async function decoratePackageJson(
  pkgJson: PackageJson,
  options: decoratePackageJson.Options,
) {
  const { cwd, tsConfig } = options

  // biome-ignore lint/style/noNonNullAssertion: _
  const relativeOutDir = `./${path.relative(cwd, tsConfig.compilerOptions!.outDir!)}`
  const outFile = (name: string, ext: string) => `./${path.join(relativeOutDir, name + ext)}`

  let exps = pkgJson.exports

  // Support single entrypoint via `main` field
  if (!exps) {
    if (!pkgJson.main)
      // TODO: better error message
      throw new Error('package.json must have an `exports` or `main` field')

    // Transform single `package.json#main` field. They
    // must point to the source file. Otherwise, an error is thrown.
    //
    // main: "./src/index.ts"
    // ↓ ↓ ↓
    // main: "./src/index.ts"
    // exports: {
    //   ".": {
    //     "src": "./src/index.ts",
    //     "types": "./dist/index.d.ts",
    //     "default": "./dist/index.js",
    //   },
    // }
    exps = {
      '.': pkgJson.main,
    }
  }

  type Exports = {
    [key: string]: {
      src: string
      types: string
      default: string
    }
  }
  const exports = Object.fromEntries(
    Object.entries(exps).map(([key, value]) => {
      // Transform single `package.json#exports` entrypoints. They
      // must point to the source file. Otherwise, an error is thrown.
      //
      // "./utils": "./src/utils.ts"
      // ↓ ↓ ↓
      // "./utils": {
      //   "src": "./src/utils.ts",
      //   "types": "./dist/utils.js",
      //   "default": "./dist/utils.d.ts"
      // }
      if (typeof value === 'string') {
        if (value.startsWith(relativeOutDir)) return [key, value]
        const name = path.basename(value, path.extname(value))
        return [
          key,
          {
            src: value,
            types: outFile(name, '.d.ts'),
            default: outFile(name, '.js'),
          },
        ]
      }

      // Transform object-like `package.json#exports` entrypoints. They
      // must include a `src` field pointing to the source file, otherwise
      // an error is thrown.
      //
      // "./utils": "./src/utils.ts"
      // ↓ ↓ ↓
      // "./utils": {
      //   "src": "./src/utils.ts",
      //   "types": "./dist/utils.js",
      //   "default": "./dist/utils.d.ts"
      // }
      if (typeof value === 'object' && value && 'src' in value && typeof value.src === 'string') {
        if (value.src.startsWith(relativeOutDir)) return [key, value]
        const name = path.basename(value.src, path.extname(value.src))
        return [
          key,
          {
            ...value,
            types: outFile(name, '.d.ts'),
            default: outFile(name, '.js'),
          },
        ]
      }

      // TODO: better error message
      throw new Error('`exports` field must be an object with a `src` field')
    }),
  ) as Exports

  const root = exports['.']

  return {
    ...pkgJson,
    type: pkgJson.type ?? 'module',
    sideEffects: pkgJson.sideEffects ?? false,
    ...(root
      ? {
          main: pkgJson.main ?? root.default,
          module: pkgJson.module ?? root.default,
          types: pkgJson.types ?? root.types,
        }
      : {}),
    exports,
  } as PackageJson
}

export declare namespace decoratePackageJson {
  type Options = {
    /** Working directory. */
    cwd: string
    /** Transformed tsconfig.json file. */
    tsConfig: TsConfigJson
  }
}

/**
 * Gets entry files from package.json exports field or main field.
 *
 * @param options - Options for getting entry files.
 * @returns Array of absolute paths to entry files.
 */
export function getEntries(options: getEntries.Options): string[] {
  const { cwd, pkgJson } = options

  // Support single entrypoint via `main` field
  if (!pkgJson.exports) {
    if (!pkgJson.main)
      // TODO: better error message
      throw new Error('package.json must have an `exports` or `main` field')

    const entry = path.resolve(cwd, pkgJson.main)
    if (!/\.(m|c)?[jt]sx?$/.test(entry))
      // TODO: better error message
      throw new Error('`main` field must point to a TypeScript or JavaScript file')

    return [entry]
  }

  const entries = Object.values(pkgJson.exports)
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (typeof entry === 'object' && entry && 'src' in entry && typeof entry.src === 'string')
        return entry.src
      // TODO: better error message
      throw new Error('`exports` field must have a `src` field')
    })
    .map((entry) => path.resolve(cwd, entry))
    .filter((entry) => /\.(m|c)?[jt]sx?$/.test(entry))

  return entries
}

export declare namespace getEntries {
  type Options = {
    /** Working directory. */
    cwd: string
    /** Package.json file. */
    pkgJson: PackageJson
  }
}

/**
 * Reads the package.json file from the given working directory.
 *
 * @param cwd - Working directory to read the package.json file from.
 * @returns Parsed package.json file as an object.
 */
export async function readPackageJson(options: readPackageJson.Options) {
  const { cwd } = options

  return (await fs
    .readFile(path.resolve(cwd, 'package.json'), 'utf-8')
    .then(JSON.parse)) as PackageJson
}

export declare namespace readPackageJson {
  type Options = {
    /** Working directory. */
    cwd: string
  }
}

/**
 * Reads the tsconfig.json file from the given working directory.
 *
 * @param cwd - Working directory to read the tsconfig.json file from.
 * @returns Parsed tsconfig.json file as an object.
 */
export async function readTsconfigJson(cwd: string): Promise<TsConfigJson> {
  const result = await Tsconfig.parse(path.resolve(cwd, 'tsconfig.json'))
  return result.tsconfig
}

/**
 * Transpiles a package.
 *
 * @param options - Options for transpiling a package.
 * @returns Transpilation artifacts.
 */
export async function transpile(options: transpile.Options): Promise<transpile.ReturnType> {
  const { cwd = process.cwd(), entries } = options

  const tsConfigJson = await readTsconfigJson(cwd)
  const tsconfigPath = path.resolve(cwd, 'tsconfig.json')
  const { module: mod, moduleResolution: modRes } = tsConfigJson.compilerOptions ?? {}
  // TODO: CLI `zile check --fix` command to add these and rewrite extensions in project (if needed).
  // TODO: extract to Package.checkTsconfig()
  const isNodeNext = (val?: string) => val === 'nodenext' || val === 'NodeNext'
  const errors = []
  if (!isNodeNext(mod))
    errors.push(`  - "module" must be "nodenext". Found: ${mod ? `"${mod}"` : 'undefined'}`)
  if (!isNodeNext(modRes))
    errors.push(
      `  - "moduleResolution" must be "nodenext". Found: ${modRes ? `"${modRes}"` : 'undefined'}`,
    )
  if (errors.length > 0)
    throw new Error(`${tsconfigPath} has invalid configuration:\n${errors.join('\n')}`)

  const compilerOptions = {
    ...tsConfigJson.compilerOptions,
    composite: false,
    declaration: true,
    declarationDir: tsConfigJson.compilerOptions?.declarationDir,
    declarationMap: true,
    emitDeclarationOnly: false,
    esModuleInterop: true,
    noEmit: false,
    outDir: tsConfigJson.compilerOptions?.outDir ?? path.resolve(cwd, 'dist'),
    skipLibCheck: true,
    sourceMap: true,
    target: tsConfigJson.compilerOptions?.target ?? 'es2021',
  } as const satisfies TsConfigJson['compilerOptions']

  const tmpProjectPath = path.resolve(import.meta.dirname, '.tmp', crypto.randomUUID())
  const tmpProject = path.resolve(tmpProjectPath, 'tsconfig.json')

  await Promise.allSettled([
    fs.rm(tmpProjectPath, { recursive: true }),
    fs.rm(compilerOptions.outDir, { recursive: true }),
  ])
  await fs.mkdir(tmpProjectPath, { recursive: true })

  const tsConfig = {
    compilerOptions,
    include: entries,
  } as const
  await fs.writeFile(tmpProject, JSON.stringify(tsConfig, null, 2))

  const tsgo = path.resolve(import.meta.dirname, '..', 'node_modules', '.bin', 'tsgo')
  const child = cp.spawn(tsgo, ['--project', tmpProject], {
    cwd,
  })

  const promise = Promise.withResolvers<null>()

  // TODO: add logging
  // child.stdout.on("data", (data) => {
  //   console.log(data.toString());
  // });
  // child.stderr.on("data", (data) => {
  //   console.error(data.toString());
  // });
  child.on('close', (code) => {
    if (code === 0) promise.resolve(null)
    else promise.reject(new Error(`tsgo exited with code ${code}`))
  })
  child.on('error', promise.reject)

  await promise.promise

  return { tsConfig }
}

export declare namespace transpile {
  type Options = {
    /** Working directory of the package to transpile. @default process.cwd() */
    cwd?: string | undefined
    /** Entry files to include in the transpilation. */
    entries: string[]
  }

  type ReturnType = {
    /** Transformed tsconfig.json file. */
    tsConfig: TsConfigJson
  }
}

/**
 * Writes the package.json file to the given working directory.
 *
 * @param cwd - Working directory to write the package.json file to.
 * @param pkgJson - Package.json file to write.
 */
export async function writePackageJson(cwd: string, pkgJson: PackageJson) {
  await fs.writeFile(path.resolve(cwd, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8')
}
