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
