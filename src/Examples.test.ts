import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as Examples from './Examples.js'

const zileRoot = path.resolve(import.meta.dirname, '..')

async function setupProject(files: Record<string, string>): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zile-examples-'))
  // Reuse zile's own typescript install via a symlinked node_modules.
  await fs.symlink(
    path.join(zileRoot, 'node_modules'),
    path.join(tmp, 'node_modules'),
    'dir',
  )
  await fs.writeFile(
    path.join(tmp, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
      },
    }),
  )
  for (const [rel, contents] of Object.entries(files)) {
    const target = path.join(tmp, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, contents)
  }
  return tmp
}

describe('Examples.extract', () => {
  it('pulls fenced ts blocks out of a JSDoc comment', () => {
    const source = [
      '/**',
      ' * Adds two numbers.',
      ' *',
      ' * @example',
      ' * ```ts',
      " * import { add } from 'mod'",
      ' * add(1, 2)',
      ' * ```',
      ' */',
      'export function add(a: number, b: number) { return a + b }',
      '',
    ].join('\n')

    const blocks = Examples.extract({ file: '/virtual/add.ts', source })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.code).toMatchInlineSnapshot(`
      "import { add } from 'mod'
      add(1, 2)"
    `)
    expect(blocks[0]?.fence).toBe('ts')
    expect(blocks[0]?.startLine).toBe(5)
  })

  it('recognizes `ts twoslash` and `typescript` fences', () => {
    const source = [
      '/**',
      ' * ```ts twoslash',
      ' * const x = 1',
      ' * ```',
      ' *',
      ' * ```typescript',
      ' * const y = 2',
      ' * ```',
      ' */',
      'export const v = 0',
      '',
    ].join('\n')

    const blocks = Examples.extract({ file: '/virtual/two.ts', source })

    expect(blocks.map((b) => b.fence)).toEqual(['ts twoslash', 'typescript'])
  })

  it('ignores fenced code inside string and template literals', () => {
    const source = [
      'export const code = `',
      '/**',
      ' * ```ts',
      ' * not a real example',
      ' * ```',
      ' */',
      '`',
      '',
    ].join('\n')

    const blocks = Examples.extract({ file: '/virtual/literal.ts', source })

    expect(blocks).toHaveLength(0)
  })
})

describe('Examples.applyFixes', () => {
  it('rewrites a snippet back into the original JSDoc comment', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zile-examples-'))
    const file = path.join(tmp, 'add.ts')
    const original = [
      '/**',
      ' * @example',
      ' * ```ts',
      ' * const x=1',
      ' * ```',
      ' */',
      'export const v = 0',
      '',
    ].join('\n')
    await fs.writeFile(file, original)

    const [block] = Examples.extract({ file, source: original })
    if (!block) throw new Error('expected a block')

    await Examples.applyFixes({ fixes: new Map([[block, 'const x = 1\n']]) })

    const next = await fs.readFile(file, 'utf8')
    expect(next).toMatchInlineSnapshot(`
      "/**
       * @example
       * \`\`\`ts
       * const x = 1
       * \`\`\`
       */
      export const v = 0
      "
    `)

    await fs.rm(tmp, { recursive: true })
  })
})

describe('Examples.check directives', () => {
  it('skips blocks marked with `// @noErrors`', async () => {
    const cwd = await setupProject({
      'src/mod.ts': [
        '/**',
        ' * @example',
        ' * ```ts',
        ' * // @noErrors',
        ' * const x: number = nope',
        ' * ```',
        ' */',
        'export const v = 0',
        '',
      ].join('\n'),
    })
    try {
      const result = await Examples.check({ cwd, format: false })
      expect(result.typeErrors).toEqual([])
    } finally {
      await fs.rm(cwd, { recursive: true, force: true })
    }
  })

  it('skips blocks marked with `// @errors:`', async () => {
    const cwd = await setupProject({
      'src/mod.ts': [
        '/**',
        ' * @example',
        ' * ```ts',
        ' * // @errors: 2304',
        ' * const x: number = nope',
        ' * ```',
        ' */',
        'export const v = 0',
        '',
      ].join('\n'),
    })
    try {
      const result = await Examples.check({ cwd, format: false })
      expect(result.typeErrors).toEqual([])
    } finally {
      await fs.rm(cwd, { recursive: true, force: true })
    }
  })

  it('strips lines annotated with `// [!code --]` before type-checking', async () => {
    const cwd = await setupProject({
      'src/mod.ts': [
        '/**',
        ' * @example',
        ' * ```ts',
        " * import { join } from 'node:path' // [!code --]",
        " * import { resolve } from 'node:path'",
        ' * const broken: number = nope // [!code --]',
        ' * const value: number = 1',
        ' * void resolve',
        ' * void value',
        ' * ```',
        ' */',
        'export const v = 0',
        '',
      ].join('\n'),
    })
    try {
      const result = await Examples.check({ cwd, format: false })
      expect(result.typeErrors).toEqual([])
    } finally {
      await fs.rm(cwd, { recursive: true, force: true })
    }
  })
})
