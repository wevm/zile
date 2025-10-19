import * as cp from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as Packages from '../src/Packages.js'

/**
 * Checks the output of the package.
 *
 * @param options - Options for checking the output.
 * @returns Output results.
 */
export async function checkOutput(options: checkOutput.Options): Promise<checkOutput.ReturnType> {
  const { cwd = process.cwd() } = options
  const [attw, publint] = await Promise.all([checkAttw({ cwd }), checkPublint({ cwd })])
  return { output: { attw: attw.output, publint: publint.output } }
}

export declare namespace checkOutput {
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
  const child = cp.spawn(attw, ['--pack', '.', '--format', 'ascii', '--profile', 'esm-only'], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
  })

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

export async function setupRepos() {
  const tmpCwd = path.resolve(import.meta.dirname, `.tmp/${crypto.randomUUID()}/repos`)
  const cwd = path.resolve(import.meta.dirname, 'repos')

  await fs.rm(tmpCwd, { recursive: true }).catch(() => {})
  await fs.mkdir(tmpCwd, { recursive: true })
  await fs.cp(cwd, tmpCwd, { recursive: true })
  const repos = await Packages.find({ cwd: tmpCwd })
  return {
    cwd: tmpCwd,
    repos: repos.map((repo) => ({ cwd: repo, relative: `/${path.relative(tmpCwd, repo)}` })),
  }
}

export async function tree(dir: string, prefix = ''): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name)
    return a.isDirectory() ? -1 : 1
  })

  let result = prefix === '' ? '\n' : ''
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]
    const isLast = i === sorted.length - 1
    const connector = isLast ? '└── ' : '├── '
    const newPrefix = isLast ? '    ' : '│   '

    let name = entry.name
    if (entry.isSymbolicLink()) {
      const target = await fs.readlink(path.join(dir, entry.name))
      name += ` -> ${target}`
    }

    result += `${prefix}${connector}${name}\n`

    if (entry.isDirectory() && !entry.isSymbolicLink())
      result += await tree(path.join(dir, entry.name), prefix + newPrefix)
  }

  return result
}
