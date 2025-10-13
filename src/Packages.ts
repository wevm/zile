import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as Package from './Package.js'

/**
 * Builds all packages in the given working directory.
 *
 * @param options - Options for building packages
 */
export async function build(options: build.Options) {
  const packages = await find(options)
  return await Promise.all(packages.map((cwd) => Package.build({ cwd })))
}

export declare namespace build {
  type Options = find.Options
}

/**
 * Finds all packages (containing a `package.json`) matching
 * the given working directory.
 *
 * @param options - Options for finding packages
 * @returns Array of absolute paths to package directories
 */
export async function find(options: find.Options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const patterns = options.includes ?? ['**', '!**/node_modules/**']

  // Separate includes and excludes from patterns
  const includes: string[] = []
  const excludes: string[] = []

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) excludes.push(pattern.slice(1))
    else includes.push(pattern)
  }

  const packageSet = new Set<string>()

  for (const pattern of includes) {
    // Find all package.json files matching the pattern
    const globPattern = (() => {
      if (path.basename(pattern) === 'package.json') return pattern
      return path.join(pattern, 'package.json')
    })()

    for await (const file of fs.glob(globPattern, { cwd, exclude: excludes })) {
      const dir = path.dirname(file)
      const absolutePath = path.resolve(cwd, dir)
      packageSet.add(absolutePath)
    }
  }

  return Array.from(packageSet)
}

export declare namespace find {
  type Options = {
    /** Working directory to start searching from. @default process.cwd() */
    cwd?: string | undefined
    /** Glob patterns to include. @default ['**'] */
    includes?: string[] | undefined
  }
}
