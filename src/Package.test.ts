import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { checkOutput, setupRepos, tree } from '../test/utils.js'
import * as Package from './Package.js'

const repos = () =>
  setupRepos().then(({ repos }) => repos.filter(({ relative }) => !relative.includes('invalid-')))

describe.each(await repos())('$relative: Package.build', ({ cwd }) => {
  test('default', async () => {
    if (cwd.includes('error-')) {
      await expect(Package.build({ cwd })).rejects.toMatchSnapshot('error')
      return
    }

    {
      const result = await Package.build({
        cwd,
      })
      expect(result).toMatchSnapshot('result')
    }

    {
      const result = await checkOutput({ cwd })
      expect(result).toMatchSnapshot('check')
    }

    const packageJsonString = await fs.readFile(path.resolve(cwd, 'package.json'), 'utf-8')
    const packageJson = JSON.parse(packageJsonString)
    expect([packageJsonString, await tree(cwd)].join('\n\n')).toMatchSnapshot('output')
    expect(await fs.readFile(path.resolve(cwd, packageJson.main), 'utf-8')).toMatchSnapshot('main')
    expect(await fs.readFile(path.resolve(cwd, packageJson.types), 'utf-8')).toMatchSnapshot(
      'types',
    )
  })

  test('link', async () => {
    if (cwd.includes('error-')) return

    const result = await Package.build({
      cwd,
      link: true,
    })
    expect(result).toMatchSnapshot('result')

    const packageJsonString = await fs.readFile(path.resolve(cwd, 'package.json'), 'utf-8')
    const packageJson = JSON.parse(packageJsonString)
    expect([packageJsonString, await tree(cwd)].join('\n\n')).toMatchSnapshot('output')

    // Verify symlinks exist (check exports field for actual symlink locations)
    const rootExport = packageJson.exports?.['.']
    const defaultPath =
      typeof rootExport === 'string'
        ? rootExport
        : typeof rootExport === 'object' && rootExport
          ? rootExport.default
          : null
    const typesPath = typeof rootExport === 'object' && rootExport ? rootExport.types : null

    if (defaultPath) {
      const mainStats = await fs.lstat(path.resolve(cwd, defaultPath))
      expect(mainStats.isSymbolicLink()).toBe(true)
      const mainTarget = await fs.readlink(path.resolve(cwd, defaultPath))
      expect(mainTarget).toMatchSnapshot('main-target')
    }

    if (typesPath) {
      const typesStats = await fs.lstat(path.resolve(cwd, typesPath))
      expect(typesStats.isSymbolicLink()).toBe(true)
      const typesTarget = await fs.readlink(path.resolve(cwd, typesPath))
      expect(typesTarget).toMatchSnapshot('types-target')
    }
  })
})

describe('Package.transpile', () => {
  test('isolates concurrent temporary projects', async () => {
    const { repos } = await setupRepos()
    const repo = repos.find(({ relative }) => relative === '/basic')
    if (!repo) throw new Error('Basic fixture not found.')

    const bin = path.resolve(repo.cwd, 'node_modules/.bin')
    const compiler = path.resolve(repo.cwd, 'compiler.cjs')
    const started = path.resolve(repo.cwd, 'compiler.started')
    const resume = path.resolve(repo.cwd, 'compiler.resume')
    await fs.mkdir(bin, { recursive: true })
    await fs.writeFile(
      compiler,
      `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const started = path.resolve('compiler.started')
const resume = path.resolve('compiler.resume')
if (!fs.existsSync(started)) {
  fs.writeFileSync(started, '')
  const timer = setInterval(() => {
    if (!fs.existsSync(resume)) return
    clearInterval(timer)
    fs.accessSync(process.argv.at(-1))
  }, 10)
} else fs.accessSync(process.argv.at(-1))
`,
      { mode: 0o755 },
    )
    await fs.symlink(compiler, path.resolve(bin, 'tsc'))

    const options = {
      cwd: repo.cwd,
      sourceDir: repo.cwd,
      sources: [path.resolve(repo.cwd, 'index.ts')],
    }
    const first = Package.transpile(options)
    await vi.waitFor(() => expect(fs.access(started)).resolves.toBeUndefined())
    const second = Package.transpile(options)
    try {
      await second
    } finally {
      await fs.writeFile(resume, '')
    }
    await first
    expect(
      (await fs.readdir(repo.cwd)).filter(
        (name) => name.startsWith('tsconfig.') && name.endsWith('.tmp.json'),
      ),
    ).toEqual([])
  })
})

describe('Package.readTransform', () => {
  test('returns undefined when not set', async () => {
    expect(await Package.readTransform({ cwd: process.cwd(), pkgJson: {} })).toBeUndefined()
  })

  test('resolves a package export with ESM conditions', async () => {
    const cwd = path.resolve(import.meta.dirname, '.tmp', crypto.randomUUID())
    const pkgDir = path.resolve(cwd, 'node_modules', 'my-flags')
    await fs.mkdir(pkgDir, { recursive: true })
    await fs.writeFile(
      path.resolve(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'my-flags',
        type: 'module',
        exports: { './zile': { import: './zile.js' } },
      }),
    )
    await fs.writeFile(path.resolve(pkgDir, 'zile.js'), 'export default (code) => code + "!"')
    const transform = await Package.readTransform({
      cwd,
      pkgJson: { zile: { transform: 'my-flags/zile' } },
    })
    expect(await transform?.('a', 'dist/index.js')).toBe('a!')
    expect(await fs.readdir(cwd)).toEqual(['node_modules'])
  })

  test('throws when the default export is not a function', async () => {
    const cwd = path.resolve(import.meta.dirname, '.tmp', crypto.randomUUID())
    await fs.mkdir(cwd, { recursive: true })
    await fs.writeFile(path.resolve(cwd, 'transform.js'), 'export default {}')
    await expect(
      Package.readTransform({ cwd, pkgJson: { zile: { transform: './transform.js' } } }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: \`./transform.js\` on \`package.json#zile.transform\` must default export a function]`,
    )
  })
})

describe('Package.getSourceDir', () => {
  test('common', async () => {
    {
      const result = Package.getSourceDir({
        sources: [
          path.resolve(process.cwd(), 'src/index.ts'),
          path.resolve(process.cwd(), 'src/foo.ts'),
          path.resolve(process.cwd(), 'src/nested/dir/index.ts'),
          path.resolve(process.cwd(), 'src/nested/dir/bar.ts'),
        ],
      })
      expect(result).toBe(path.resolve(process.cwd(), 'src'))
    }

    {
      const result = Package.getSourceDir({
        sources: [
          path.resolve(process.cwd(), 'src/index.ts'),
          path.resolve(process.cwd(), 'foo.ts'),
          path.resolve(process.cwd(), 'bar/nested/dir/index.ts'),
          path.resolve(process.cwd(), 'src/nested/dir/bar.ts'),
        ],
      })
      expect(result).toBe(process.cwd())
    }
  })
})

describe('Package.detectIndent', () => {
  test('detects 2 spaces', () => {
    const content = `{
  "name": "test",
  "version": "1.0.0"
}`
    expect(Package.detectIndent(content)).toBe('  ')
  })

  test('detects 4 spaces', () => {
    const content = `{
    "name": "test",
    "version": "1.0.0"
}`
    expect(Package.detectIndent(content)).toBe('    ')
  })

  test('detects tabs', () => {
    const content = `{
\t"name": "test",
\t"version": "1.0.0"
}`
    expect(Package.detectIndent(content)).toBe('\t')
  })

  test('detects mixed indentation (tabs first)', () => {
    const content = `{
\t  "name": "test",
\t  "version": "1.0.0"
}`
    expect(Package.detectIndent(content)).toBe('\t')
  })

  test('returns default for empty file', () => {
    expect(Package.detectIndent('')).toBe('  ')
  })

  test('returns default for file with no indentation', () => {
    const content = `{"name":"test","version":"1.0.0"}`
    expect(Package.detectIndent(content)).toBe('  ')
  })

  test('handles Windows line endings', () => {
    const content = `{\r\n  "name": "test",\r\n  "version": "1.0.0"\r\n}`
    expect(Package.detectIndent(content)).toBe('  ')
  })

  test('detects indentation from first indented line', () => {
    const content = `{
"name": "test",
  "version": "1.0.0",
    "nested": {
      "value": true
    }
}`
    expect(Package.detectIndent(content)).toBe('  ')
  })
})

describe('Package.stripPreMarkerKeys', () => {
  test('strips keys before marker', () => {
    const data = {
      scripts: { dev: 'echo dev', postinstall: 'pnpm dev' },
      devDependencies: { typescript: '^5' },
      '[!start-pkg]': '',
      name: 'my-package',
      version: '1.0.0',
      dependencies: { foo: '^1' },
    }
    const result = Package.stripPreMarkerKeys(data)
    expect(result).toEqual({
      name: 'my-package',
      version: '1.0.0',
      dependencies: { foo: '^1' },
    })
  })

  test('returns data unchanged when no marker', () => {
    const data = {
      name: 'my-package',
      version: '1.0.0',
      scripts: { build: 'echo build' },
    }
    const result = Package.stripPreMarkerKeys(data)
    expect(result).toEqual({
      name: 'my-package',
      version: '1.0.0',
      scripts: { build: 'echo build' },
    })
  })

  test('strips all keys when marker is last', () => {
    const data = {
      scripts: { dev: 'echo dev' },
      '[!start-pkg]': '',
    }
    const result = Package.stripPreMarkerKeys(data)
    expect(result).toEqual({})
  })
})

describe('Package.writePackageJson', () => {
  test('preserves trailing newline when present', async () => {
    const tmpDir = path.resolve(import.meta.dirname, '.tmp', crypto.randomUUID())
    await fs.mkdir(tmpDir, { recursive: true })

    const pkgPath = path.resolve(tmpDir, 'package.json')
    const contentWithNewline = `{\n  "name": "test",\n  "version": "1.0.0"\n}\n`
    await fs.writeFile(pkgPath, contentWithNewline, 'utf-8')

    const pkgJson = await Package.readPackageJson({ cwd: tmpDir })
    pkgJson.version = '1.0.1'
    await Package.writePackageJson(tmpDir, pkgJson)

    const result = await fs.readFile(pkgPath, 'utf-8')
    expect(result.endsWith('\n')).toBe(true)

    await fs.rm(tmpDir, { recursive: true })
  })

  test('preserves no trailing newline when absent', async () => {
    const tmpDir = path.resolve(import.meta.dirname, '.tmp', crypto.randomUUID())
    await fs.mkdir(tmpDir, { recursive: true })

    const pkgPath = path.resolve(tmpDir, 'package.json')
    const contentWithoutNewline = `{\n  "name": "test",\n  "version": "1.0.0"\n}`
    await fs.writeFile(pkgPath, contentWithoutNewline, 'utf-8')

    const pkgJson = await Package.readPackageJson({ cwd: tmpDir })
    pkgJson.version = '1.0.1'
    await Package.writePackageJson(tmpDir, pkgJson)

    const result = await fs.readFile(pkgPath, 'utf-8')
    expect(result.endsWith('\n')).toBe(false)
    expect(result.endsWith('}\n')).toBe(false)
    expect(result.endsWith('}')).toBe(true)

    await fs.rm(tmpDir, { recursive: true })
  })

  test('defaults to trailing newline when no cache exists', async () => {
    const tmpDir = path.resolve(import.meta.dirname, '.tmp', crypto.randomUUID())
    await fs.mkdir(tmpDir, { recursive: true })

    const pkgJson = { name: 'test', version: '1.0.0' }
    await Package.writePackageJson(tmpDir, pkgJson)

    const result = await fs.readFile(path.resolve(tmpDir, 'package.json'), 'utf-8')
    expect(result.endsWith('\n')).toBe(true)

    await fs.rm(tmpDir, { recursive: true })
  })
})
