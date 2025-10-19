import * as cp from 'node:child_process'
import * as fsSync from 'node:fs'
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
  const { cwd = process.cwd(), link = false, project = './tsconfig.json', tsgo } = options

  let [pkgJson, tsConfig] = await Promise.all([
    readPackageJson({ cwd }),
    readTsconfigJson({ cwd, project }),
  ])
  const outDir = tsConfig.compilerOptions?.outDir ?? path.resolve(cwd, 'dist')

  await checkInput({ cwd, outDir })

  const entries = getEntries({ cwd, pkgJson })

  if (!link) {
    const result = await transpile({ cwd, entries, tsgo })
    tsConfig = result.tsConfig
  }

  if (link) {
    await fs.rm(outDir, { recursive: true }).catch(() => {})
    await fs.mkdir(outDir, { recursive: true })
  }

  const sourceDir = getSourceDir({ cwd, entries })
  const packageJson = await decoratePackageJson(pkgJson, { cwd, link, outDir, sourceDir })

  await writePackageJson(cwd, packageJson)

  return { packageJson, tsConfig }
}

export declare namespace build {
  type Options = {
    /** Working directory to start searching from. @default process.cwd() */
    cwd?: string | undefined
    /** Whether to link output files to source files for development. @default false */
    link?: boolean | undefined
    /** Path to tsconfig.json file, relative to the working directory. @default './tsconfig.json' */
    project?: string | undefined
    /** Whether to use tsgo for transpilation. @default false */
    tsgo?: boolean | undefined
  }

  type ReturnType = {
    /** Transformed package.json file. */
    packageJson: PackageJson
    /** tsconfig.json used for transpilation. */
    tsConfig: TsConfigJson
  }
}

/**
 * Checks the inputs of the package.
 *
 * @param options - Options for checking the input.
 * @returns Input check results.
 */
export async function checkInput(options: checkInput.Options): Promise<checkInput.ReturnType> {
  return await checkPackageJson(options)
}

export declare namespace checkInput {
  type Options = {
    /** Working directory to check. @default process.cwd() */
    cwd?: string | undefined
    /** Output directory. @default path.resolve(cwd, 'dist') */
    outDir?: string | undefined
  }

  type ReturnType = undefined
}

/**
 * Determines if the package.json file is valid for transpiling.
 *
 * @param options - Options for checking the package.json file.
 * @returns Whether the package.json file is valid for transpiling.
 */
export async function checkPackageJson(
  options: checkPackageJson.Options,
): Promise<checkPackageJson.ReturnType> {
  const { cwd = process.cwd(), outDir = path.resolve(cwd, 'dist') } = options
  const pkgJson = await readPackageJson({ cwd })

  function exists(value: string) {
    if (value.includes(path.relative(cwd, outDir))) return true
    return fsSync.existsSync(path.resolve(cwd, value))
  }

  if (!pkgJson.exports && !pkgJson.main && !pkgJson.bin)
    throw new Error('package.json must have an `exports`, `main`, or `bin` field')

  if (pkgJson.bin)
    if (typeof pkgJson.bin === 'string') {
      if (!exists(pkgJson.bin))
        throw new Error(`\`${pkgJson.bin}\` does not exist on \`package.json#bin\``)
    } else {
      for (const [key, value] of Object.entries(pkgJson.bin)) {
        if (!value) throw new Error(`\`bin.${key}\` value must be a string`)
        if (typeof value === 'string' && !exists(value))
          throw new Error(`\`${value}\` does not exist on \`package.json#bin.${key}\``)
      }
    }

  if (pkgJson.main)
    if (!exists(pkgJson.main))
      throw new Error(`\`${pkgJson.main}\` does not exist on \`package.json#main\``)

  if (pkgJson.exports) {
    for (const [key, entry] of Object.entries(pkgJson.exports)) {
      if (typeof entry === 'string' && !exists(entry))
        throw new Error(`\`${entry}\` does not exist on \`package.json#exports["${key}"]\``)
      if (
        typeof entry === 'object' &&
        entry &&
        'src' in entry &&
        typeof entry.src === 'string' &&
        !exists(entry.src)
      )
        throw new Error(`\`${entry.src}\` does not exist on \`package.json#exports["${key}"].src\``)
    }
  }

  return undefined
}

export declare namespace checkPackageJson {
  type Options = {
    /** Working directory to check. @default process.cwd() */
    cwd?: string | undefined
    /** Output directory. @default path.resolve(cwd, 'dist') */
    outDir?: string | undefined
  }

  type ReturnType = undefined
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
  const { cwd, link, outDir, sourceDir } = options

  const relativeOutDir = `./${path.relative(cwd, outDir)}`
  const relativeSourceDir = `./${path.relative(cwd, sourceDir)}`

  const outFile = (name: string, ext: string = '') =>
    './' +
    path.join(
      relativeOutDir,
      name.replace(relativeSourceDir, '').replace(path.extname(name), '') + ext,
    )

  let bin = pkgJson.bin
  if (bin) {
    if (typeof bin === 'string') {
      if (!bin.startsWith(relativeOutDir))
        bin = {
          // biome-ignore lint/style/noNonNullAssertion: _
          [pkgJson.name!]: outFile(bin, '.js'),
          // biome-ignore lint/style/useTemplate: _
          // biome-ignore lint/style/noNonNullAssertion: _
          [pkgJson.name! + '.src']: bin,
        }
    } else {
      bin = Object.fromEntries(
        Object.entries(bin).flatMap((entry) => {
          const [key, value] = entry
          if (!value) throw new Error(`\`bin.${key}\` field must have a value`)
          return [
            [key.replace('.src', ''), outFile(value, '.js')],
            [key, value],
          ]
        }),
      )
    }
  }

  let exps = pkgJson.exports

  // Support single entrypoint via `main` field
  if (pkgJson.main) {
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
      ...(typeof exps === 'object' ? exps : {}),
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
    exps
      ? Object.entries(exps).map(([key, value]) => {
          function linkExports(entry: string) {
            try {
              const destJsAbsolute = path.resolve(cwd, outFile(entry, '.js'))
              const destDtsAbsolute = path.resolve(cwd, outFile(entry, '.d.ts'))
              const dir = path.dirname(destJsAbsolute)

              if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true })

              const srcAbsolute = path.resolve(cwd, entry)
              const srcRelativeJs = path.relative(path.dirname(destJsAbsolute), srcAbsolute)
              const srcRelativeDts = path.relative(path.dirname(destDtsAbsolute), srcAbsolute)

              fsSync.symlinkSync(srcRelativeJs, destJsAbsolute, 'file')
              fsSync.symlinkSync(srcRelativeDts, destDtsAbsolute, 'file')
            } catch {}
          }

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
            if (!/\.(m|c)?[jt]sx?$/.test(value)) return [key, value]
            if (link) linkExports(value)
            return [
              key,
              {
                src: value,
                types: outFile(value, '.d.ts'),
                default: outFile(value, '.js'),
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
          if (
            typeof value === 'object' &&
            value &&
            'src' in value &&
            typeof value.src === 'string'
          ) {
            if (value.src.startsWith(relativeOutDir)) return [key, value]
            if (!/\.(m|c)?[jt]sx?$/.test(value.src)) return [key, value]
            if (link) linkExports(value.src)
            return [
              key,
              {
                ...value,
                types: outFile(value.src, '.d.ts'),
                default: outFile(value.src, '.js'),
              },
            ]
          }
          throw new Error('`exports` field in package.json must be an object with a `src` field')
        })
      : [],
  ) as Exports

  const root = exports['.']

  return {
    ...pkgJson,
    type: pkgJson.type ?? 'module',
    sideEffects: pkgJson.sideEffects ?? false,
    ...(bin ? { bin } : {}),
    ...(root
      ? {
          main: root.default,
          module: root.default,
          types: root.types,
        }
      : {}),
    exports,
  } as PackageJson
}

export declare namespace decoratePackageJson {
  type Options = {
    /** Working directory. */
    cwd: string
    /** Whether to link output files to source files for development. */
    link: boolean
    /** Output directory. */
    outDir: string
    /** Source directory. */
    sourceDir: string
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

  const entries: string[] = []

  if (pkgJson.bin) {
    if (typeof pkgJson.bin === 'string') entries.push(path.resolve(cwd, pkgJson.bin))
    else
      entries.push(
        ...(Object.entries(pkgJson.bin)
          .map(([key, value]) =>
            // biome-ignore lint/style/noNonNullAssertion: _
            key.endsWith('.src') ? path.resolve(cwd, value!) : undefined,
          )
          .filter(Boolean) as string[]),
      )
  }

  if (pkgJson.exports)
    entries.push(
      ...Object.values(pkgJson.exports)
        .map((entry) => {
          if (typeof entry === 'string') return entry
          if (typeof entry === 'object' && entry && 'src' in entry && typeof entry.src === 'string')
            return entry.src
          throw new Error('`exports` field in package.json must have a `src` field')
        })
        .map((entry) => path.resolve(cwd, entry))
        .filter((entry) => /\.(m|c)?[jt]sx?$/.test(entry)),
    )
  else if (pkgJson.main) entries.push(path.resolve(cwd, pkgJson.main))

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
 * Gets the source directory from the entry files.
 *
 * @param options - Options for getting the source directory.
 * @returns Source directory.
 */
export function getSourceDir(options: getSourceDir.Options): string {
  const { cwd = process.cwd(), entries } = options

  if (entries.length === 0) return path.resolve(cwd, 'src')

  // Get directories of all entries
  const dirs = entries.map((entry) => path.dirname(entry))

  // Split each directory into segments
  const segments = dirs.map((dir) => dir.split(path.sep))

  // Find common segments
  const commonSegments: string[] = []
  const minLength = Math.min(...segments.map((s) => s.length))

  for (let i = 0; i < minLength; i++) {
    const segment = segments[0][i]
    if (segments.every((s) => s[i] === segment)) commonSegments.push(segment)
    else break
  }

  const commonPath = commonSegments.join(path.sep)
  return path.resolve(cwd, path.relative(cwd, commonPath).split(path.sep)[0])
}

export declare namespace getSourceDir {
  type Options = {
    /** Working directory. */
    cwd?: string | undefined
    /** Entry files. */
    entries: string[]
  }
}

/**
 * Reads the package.json file from the given working directory.
 *
 * @param cwd - Working directory to read the package.json file from.
 * @returns Parsed package.json file as an object.
 */
const packageJsonCache: Map<string, PackageJson> = new Map()
export async function readPackageJson(options: readPackageJson.Options) {
  const { cwd } = options

  if (packageJsonCache.has(cwd)) return packageJsonCache.get(cwd) as PackageJson
  const packageJson = await fs.readFile(path.resolve(cwd, 'package.json'), 'utf-8').then(JSON.parse)
  packageJsonCache.set(cwd, packageJson)
  return packageJson
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
 * @param project - Path to tsconfig.json file, relative to the working directory. @default './tsconfig.json'
 * @returns Parsed tsconfig.json file as an object.
 */
const tsconfigJsonCache: Map<string, TsConfigJson> = new Map()
export async function readTsconfigJson(options: readTsconfigJson.Options): Promise<TsConfigJson> {
  const { cwd, project = './tsconfig.json' } = options
  if (tsconfigJsonCache.has(cwd)) return tsconfigJsonCache.get(cwd) as TsConfigJson
  const result = await Tsconfig.parse(path.resolve(cwd, project))
  tsconfigJsonCache.set(cwd, result.tsconfig)
  return result.tsconfig
}

export declare namespace readTsconfigJson {
  type Options = {
    /** Working directory. */
    cwd: string
    /** Path to tsconfig.json file, relative to the working directory. @default './tsconfig.json' */
    project?: string | undefined
  }
}

/**
 * Transpiles a package.
 *
 * @param options - Options for transpiling a package.
 * @returns Transpilation artifacts.
 */
export async function transpile(options: transpile.Options): Promise<transpile.ReturnType> {
  const { cwd = process.cwd(), entries, project = './tsconfig.json', tsgo } = options

  const tsConfigJson = await readTsconfigJson({ cwd, project })
  const tsconfigPath = path.resolve(cwd, project)
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

  const tsConfig = {
    compilerOptions,
    exclude: tsConfigJson.exclude ?? [],
    include: [...(tsConfigJson.include ?? []), ...entries] as string[],
  } as const

  const tmpProject = path.resolve(cwd, 'tsconfig.tmp.json')
  await fs.writeFile(tmpProject, JSON.stringify(tsConfig, null, 2))

  await fs.rm(compilerOptions.outDir, { recursive: true }).catch(() => {})
  const tsc = findTsc({ bin: tsgo ? 'tsgo' : 'tsc', cwd })
  const child = cp.spawn(tsc, ['--project', tmpProject], {
    cwd,
    stdio: 'inherit',
  })

  const promise = Promise.withResolvers<null>()

  child.on('close', (code) => {
    if (code === 0) promise.resolve(null)
    else promise.reject(new Error(`tsgo exited with code ${code}`))
  })
  child.on('error', promise.reject)

  await promise.promise.finally(() => fs.rm(tmpProject))

  return { tsConfig }
}

export declare namespace transpile {
  type Options = {
    /** Working directory of the package to transpile. @default process.cwd() */
    cwd?: string | undefined
    /** Entry files to include in the transpilation. */
    entries: string[]
    /** Path to tsconfig.json file, relative to the working directory. @default './tsconfig.json' */
    project?: string | undefined
    /** Whether to use tsgo for transpilation. @default false */
    tsgo?: boolean | undefined
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

/**
 * Finds the nearest node_modules/.bin binary by traversing up the directory tree.
 *
 * @param options - Options for finding the binary.
 * @returns Absolute path to the binary.
 * @internal
 */
// biome-ignore lint/correctness/noUnusedVariables: _
function findTsc(options: findTsc.Options): string {
  const { bin, cwd = import.meta.dirname } = options

  let currentDir = path.resolve(cwd)
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const binPath = path.join(currentDir, 'node_modules', '.bin', bin)
    if (fsSync.existsSync(binPath)) return binPath

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  throw new Error(`node_modules/.bin/${bin} not found`)
}

declare namespace findTsc {
  type Options = {
    /** Binary name to find */
    bin: string
    /** Working directory to start searching from. @default import.meta.dirname */
    cwd?: string | undefined
  }
}
