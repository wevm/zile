import path from 'node:path'
import { setupRepos } from '../test/utils.js'
import * as Packages from './Packages.js'

const cwd = path.resolve(import.meta.dirname, '..')

describe('Packages.find', () => {
  function relative(absolutePaths: string[]): string[] {
    return absolutePaths.map((p) => `/${path.relative(cwd, p)}`)
  }

  it('finds all packages under a given `cwd`', async () => {
    const result = await Packages.find({
      cwd,
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/",
        "/test/repos/basic-object-exports",
        "/test/repos/basic",
      ]
    `)
  })

  it('finds all packages under an alternate `cwd`', async () => {
    const result = await Packages.find({
      cwd: path.resolve(import.meta.dirname, '../test'),
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/test/repos/basic-object-exports",
        "/test/repos/basic",
      ]
    `)
  })

  it('finds packages in specific directory', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['test/repos/basic'],
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/test/repos/basic",
      ]
    `)
  })

  it('finds packages with pattern ending in package.json', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['test/repos/basic/package.json'],
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/test/repos/basic",
      ]
    `)
  })

  it('finds packages with wildcard pattern', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['test/repos/*'],
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/test/repos/basic-object-exports",
        "/test/repos/basic",
      ]
    `)
  })

  it('deduplicates results from multiple patterns', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['test/repos/basic', 'test/repos/basic/package.json'],
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/test/repos/basic",
      ]
    `)
  })

  it('returns empty array when no packages found', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['nonexistent'],
    })

    expect(relative(result)).toMatchInlineSnapshot(`[]`)
  })

  it('returns absolute paths', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['test/repos/basic'],
    })

    expect(result.length).toBeGreaterThan(0)
    expect(path.isAbsolute(result[0])).toBe(true)
  })

  it('uses process.cwd() when no cwd provided', async () => {
    const originalCwd = process.cwd()
    const testDir = path.join(cwd, 'test/repos/basic')
    process.chdir(testDir)

    const result = await Packages.find()

    process.chdir(originalCwd)

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/test/repos/basic",
      ]
    `)
  })

  it('uses default includes when not provided', async () => {
    const result = await Packages.find({
      cwd,
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/",
        "/test/repos/basic-object-exports",
        "/test/repos/basic",
      ]
    `)
  })

  it('excludes node_modules by default', async () => {
    const result = await Packages.find({
      cwd,
    })

    const hasNodeModules = relative(result).some((p) => p.includes('node_modules'))
    expect(hasNodeModules).toBe(false)
  })

  it('can include node_modules without excludes', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['node_modules/@types/node'],
    })

    expect(relative(result)).toMatchInlineSnapshot(`
      [
        "/node_modules/@types/node",
      ]
    `)
  })

  it('handles excludes', async () => {
    const result = await Packages.find({
      cwd,
      includes: ['test/**', '!test/repos'],
    })

    expect(relative(result)).toMatchInlineSnapshot(`[]`)
  })
})

describe('Packages.build', () => {
  it('builds all packages', async () => {
    const { cwd } = await setupRepos()

    const result = await Packages.build({
      cwd,
    })

    expect(result).toMatchSnapshot()
  })
})
