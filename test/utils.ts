import * as fs from 'node:fs/promises'
import path from 'node:path'
import * as Packages from '../src/Packages.js'

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
