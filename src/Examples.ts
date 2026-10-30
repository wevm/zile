import * as cp from 'node:child_process'
import * as fsSync from 'node:fs'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import * as oxfmt from 'oxfmt'

type Ast = typeof import('typescript/unstable/ast')

let astModule: Ast | undefined

/**
 * Lazily loads the TypeScript syntax toolkit (`typescript/unstable/ast`).
 *
 * Loaded on demand (instead of a top-level import) so that zile's CLI and
 * library entrypoints work without TypeScript installed — `typescript` is an
 * optional peer dependency, and only JSDoc example checking needs its API.
 */
function ast(): Ast {
  if (astModule) return astModule
  try {
    astModule = createRequire(import.meta.url)('typescript/unstable/ast') as Ast
  } catch (cause) {
    throw new Error(
      'zile: JSDoc example checking requires `typescript` (>=7.0.0) to be installed.',
      { cause },
    )
  }
  return astModule
}

export type FormatOptions = oxfmt.FormatOptions

/**
 * Default formatter options for example snippets.
 * Tightens `printWidth` so wrapped lines fit comfortably inside JSDoc.
 */
export const defaultFormatOptions: FormatOptions = {
  printWidth: 60,
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
}

/**
 * A fenced code block extracted from a JSDoc comment.
 */
export type Block = {
  /** Absolute path of the source file the block came from. */
  file: string
  /** 0-based index of this block within its file. */
  index: number
  /** 1-based line in the source file where the opening fence lives. */
  startLine: number
  /** Code body with the JSDoc `*` prefix stripped. */
  code: string
  /** Absolute file offset of the first character of the opening fence line. */
  openStart: number
  /** Absolute file offset just after the closing fence's backticks. */
  closeEnd: number
  /** Leading indentation of each JSDoc `*` line. */
  indent: string
  /** Fence header (e.g. `ts twoslash`). */
  fence: string
}

/** Matches the opening line of a `ts` / `typescript` fenced block. */
const openFence = /^([ \t]*)\*[ \t]?```((?:ts|typescript)(?:[ \t]+twoslash)?[ \t]*)$/
/** Matches the closing ``` line of a fenced block. */
const closeFence = /^([ \t]*)\*[ \t]?```[ \t]*$/

/**
 * Extracts every fenced `ts` / `typescript` / `ts twoslash` code block from
 * JSDoc `/** ... *\u002F` comments in a source file.
 *
 * Comment extraction tokenizes the source with the TypeScript scanner so
 * fenced code inside string or template literals can't be confused with a
 * real doc comment.
 *
 * @param options - Options for extracting blocks.
 * @returns Array of extracted blocks in source order.
 */
export function extract(options: extract.Options): extract.ReturnType {
  const { file, source } = options

  const ranges = collectJsDocRanges(source)
  const starts = lineStarts(source)
  const blocks: Block[] = []

  for (const range of ranges) {
    const commentText = source.slice(range.pos, range.end)
    const commentStartLine = computeLineNumber(starts, range.pos)
    const lines = commentText.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.replace(/\r$/, '')
      const open = line.match(openFence)
      if (!open) continue

      let close = -1
      for (let j = i + 1; j < lines.length; j++) {
        if (closeFence.test(lines[j]!.replace(/\r$/, ''))) {
          close = j
          break
        }
      }
      if (close === -1) break

      const indent = open[1]!
      const fence = open[2]!.trim()

      const openLineFileNo = commentStartLine + i
      const closeLineFileNo = commentStartLine + close
      const openStart = starts[openLineFileNo - 1]!
      const closeStartOffset = starts[closeLineFileNo - 1]!
      const closeLineText = lines[close]!.replace(/\r$/, '')
      const closeEnd = closeStartOffset + closeLineText.length

      const bodyLines = lines
        .slice(i + 1, close)
        .map((raw) => raw.replace(/\r$/, '').replace(/^[ \t]*\*[ \t]?/, ''))

      blocks.push({
        file,
        index: blocks.length,
        startLine: openLineFileNo,
        code: bodyLines.join('\n'),
        openStart,
        closeEnd,
        indent,
        fence,
      })

      i = close
    }
  }

  return blocks
}

export declare namespace extract {
  type Options = {
    /** Absolute path of the source file (used for error messages and indexing). */
    file: string
    /** Source code to extract blocks from. */
    source: string
  }

  type ReturnType = readonly Block[]
}

/**
 * Typecheck (and optionally format) every JSDoc example under `cwd`.
 *
 * Walks `sourceDir` (default: `src/`), extracts JSDoc examples via
 * {@link extract}, writes one file per block to a sibling directory of
 * `cwd`, runs `tsc --noEmit` against them, and runs each block through
 * `oxfmt.format`. With `fix: true`, formatted snippets are written back
 * into the original JSDoc comments.
 *
 * @param options - Options for the check.
 * @returns Aggregated results: extracted blocks, type errors, format fixes.
 */
export async function check(options: check.Options = {}): Promise<check.ReturnType> {
  const {
    cwd = process.cwd(),
    sourceDir = path.resolve(cwd, 'src'),
    format = true,
    formatOptions = defaultFormatOptions,
    project = './tsconfig.json',
    fix = false,
    workDir = path.resolve(cwd, '.examples'),
  } = options

  const sources = await walkSources(sourceDir)
  const blocks = (
    await Promise.all(
      sources.map(async (file) => {
        const source = await fs.readFile(file, 'utf8')
        return extract({ file, source })
      }),
    )
  ).flat()

  if (blocks.length === 0) return { blocks: [], typeErrors: [], formatFixes: new Map() }

  const checkDir = path.join(workDir, 'check')
  const index = writeExamples({ blocks, checkDir, sourceDir, cwd, project })

  const typeErrors = runTsc({ cwd, checkDir, index })
  const formatFixes = format
    ? await formatBlocks({ blocks, formatOptions })
    : new Map<Block, string>()

  if (fix && formatFixes.size > 0) await applyFixes({ fixes: formatFixes })

  await fs.rm(workDir, { recursive: true }).catch(() => {})

  return { blocks, typeErrors, formatFixes }
}

export declare namespace check {
  type Options = {
    /** Working directory. @default process.cwd() */
    cwd?: string | undefined
    /** Directory to scan for source files. @default path.resolve(cwd, 'src') */
    sourceDir?: string | undefined
    /** When false, skips running snippets through oxfmt. @default true */
    format?: boolean | undefined
    /** Oxfmt options applied to each extracted snippet. @default { printWidth: 60, semi: false, singleQuote: true, trailingComma: 'none' } */
    formatOptions?: FormatOptions | undefined
    /** Path to the tsconfig.json the check tsconfig should extend. @default './tsconfig.json' */
    project?: string | undefined
    /** When true, formatted snippets are written back into the source. @default false */
    fix?: boolean | undefined
    /** Scratch directory used to stage extracted examples. @default path.resolve(cwd, '.examples') */
    workDir?: string | undefined
  }

  type ReturnType = {
    /** Every extracted block, in source order. */
    blocks: readonly Block[]
    /** Type errors reported by `tsc` against the extracted examples. */
    typeErrors: readonly TypeError[]
    /** Mapping of block → formatted code for blocks that aren't already formatted. */
    formatFixes: Map<Block, string>
  }
}

/**
 * A single type error reported against an extracted example.
 */
export type TypeError = {
  /** The block the error came from, when we could map it back. */
  block: Block | undefined
  /** 1-based line within the snippet. */
  line: number | undefined
  /** 1-based column within the snippet. */
  column: number | undefined
  /** TSC error message, e.g. `error TS2304: Cannot find name 'foo'.`. */
  message: string
  /** Raw line as printed by tsc. */
  raw: string
}

/**
 * Writes formatted snippets back into the source files they came from.
 *
 * Fixes are grouped by file and applied from highest offset to lowest so
 * earlier byte offsets stay valid. Refuses to write when a block's fence
 * no longer matches the recorded offsets (e.g. the source has drifted).
 *
 * @param options - Options for applying fixes.
 */
export async function applyFixes(options: applyFixes.Options): Promise<void> {
  const { fixes } = options

  const byFile = new Map<string, { block: Block; formatted: string }[]>()
  for (const [block, formatted] of fixes) {
    const list = byFile.get(block.file) ?? []
    list.push({ block, formatted })
    byFile.set(block.file, list)
  }

  for (const [file, entries] of byFile) {
    let source = await fs.readFile(file, 'utf8')
    entries.sort((a, b) => b.block.openStart - a.block.openStart)

    for (const { block, formatted } of entries) {
      const original = source.slice(block.openStart, block.closeEnd)
      const openLine = `${block.indent}* \`\`\`${block.fence}`
      if (!original.startsWith(openLine) || !original.trimEnd().endsWith('```'))
        throw new Error(
          `Examples.applyFixes refused to write ${file}: ` +
            `block #${block.index + 1} at offset ${block.openStart} no longer matches its fence. ` +
            `Re-run Examples.check.`,
        )

      const formattedBody = formatted.replace(/\n+$/, '')
      const indent = block.indent
      const bodyLines = formattedBody
        .split('\n')
        .map((line) => (line ? `${indent}* ${line}` : `${indent}*`))
        .join('\n')
      const replacement = `${indent}* \`\`\`${block.fence}\n${bodyLines}\n${indent}* \`\`\``
      source = source.slice(0, block.openStart) + replacement + source.slice(block.closeEnd)
    }

    await fs.writeFile(file, source)
  }
}

export declare namespace applyFixes {
  type Options = {
    /** Block → formatted code mapping (as returned by `check`). */
    fixes: ReadonlyMap<Block, string>
  }
}

async function walkSources(dir: string, out: string[] = []): Promise<string[]> {
  let entries: fsSync.Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) await walkSources(entryPath, out)
    else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test-d.ts') &&
      !entry.name.endsWith('.snap-d.ts')
    )
      out.push(entryPath)
  }
  return out
}

function lineStarts(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1)
  return starts
}

function computeLineNumber(starts: number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (starts[mid]! <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/** A comment's absolute offsets within its source file. */
type CommentRange = {
  pos: number
  end: number
}

/**
 * Returns whether a `/` following `prev` starts a regular expression literal
 * (rather than a division operator). Mirrors the token table used by the
 * TypeScript classifier: after a token that can end an expression, `/` means
 * division; anywhere else it starts a regex.
 */
function isRegexStartContext(prev: number | undefined, kind: Ast['SyntaxKind']): boolean {
  switch (prev) {
    case kind.Identifier:
    case kind.StringLiteral:
    case kind.NumericLiteral:
    case kind.BigIntLiteral:
    case kind.RegularExpressionLiteral:
    case kind.NoSubstitutionTemplateLiteral:
    case kind.TemplateTail:
    case kind.ThisKeyword:
    case kind.TrueKeyword:
    case kind.FalseKeyword:
    case kind.NullKeyword:
    case kind.PlusPlusToken:
    case kind.MinusMinusToken:
    case kind.CloseParenToken:
    case kind.CloseBracketToken:
    case kind.CloseBraceToken:
      return false
    default:
      return true
  }
}

/**
 * Collects the ranges of every JSDoc (`/**`) comment in the source.
 *
 * Runs the TypeScript scanner over the full text (with trivia included) so
 * string, template, and regex literals are tokenized properly and comment
 * look-alikes inside them are never collected.
 */
function collectJsDocRanges(source: string): CommentRange[] {
  const { SyntaxKind, createScanner } = ast()
  const scanner = createScanner(/*skipTrivia*/ false, /*languageVariant*/ undefined, source)

  const ranges: CommentRange[] = []
  // Brace depth recorded at each `${` so the matching `}` resumes its template.
  const templateStack: number[] = []
  let braceDepth = 0
  let prevToken: number | undefined

  while (true) {
    let token: number = scanner.scan()
    if (token === SyntaxKind.EndOfFile) break

    switch (token) {
      case SyntaxKind.OpenBraceToken:
        braceDepth++
        break
      case SyntaxKind.CloseBraceToken:
        if (templateStack.length > 0 && braceDepth === templateStack[templateStack.length - 1]) {
          token = scanner.reScanTemplateToken(/*isTaggedTemplate*/ false)
          if (token === SyntaxKind.TemplateTail) templateStack.pop()
        } else braceDepth--
        break
      case SyntaxKind.TemplateHead:
        templateStack.push(braceDepth)
        break
      case SyntaxKind.SlashToken:
      case SyntaxKind.SlashEqualsToken:
        if (isRegexStartContext(prevToken, SyntaxKind)) token = scanner.reScanSlashToken()
        break
      case SyntaxKind.MultiLineCommentTrivia:
        if (source[scanner.getTokenStart() + 2] === '*')
          ranges.push({ pos: scanner.getTokenStart(), end: scanner.getTokenEnd() })
        break
    }

    const isTrivia = token >= SyntaxKind.FirstTriviaToken && token <= SyntaxKind.LastTriviaToken
    if (!isTrivia) prevToken = token
  }

  return ranges
}

type WriteExamplesOptions = {
  blocks: readonly Block[]
  checkDir: string
  sourceDir: string
  cwd: string
  project: string
}

/**
 * Matches a twoslash directive that marks a block as intentionally
 * not type-checking cleanly:
 * - `// @noErrors` — suppress all errors
 * - `// @errors: <codes>` — assert specific errors are present
 *
 * Both indicate the block should be skipped by `tsc`.
 */
const skipCheckDirective = /^\s*\/\/\s*@(?:noErrors\b|errors:)/m
/** Matches a `// [!code --]` annotation anywhere on a line. */
const codeRemovedAnnotation = /\/\/[^\n]*\[!code\s+--\]/

function writeExamples(options: WriteExamplesOptions): Map<string, Block> {
  const { blocks, checkDir, sourceDir, cwd, project } = options
  fsSync.rmSync(path.dirname(checkDir), { recursive: true, force: true })
  fsSync.mkdirSync(checkDir, { recursive: true })

  const index = new Map<string, Block>()
  for (const block of blocks) {
    // Skip blocks marked with `// @noErrors` or `// @errors: ...`.
    if (skipCheckDirective.test(block.code)) continue

    const relativeSource = path.relative(sourceDir, block.file).replace(/[/.]/g, '_')
    const filename = `${relativeSource}__${block.index}.ts`

    // Strip lines marked with `// [!code --]` (diff "old" lines that
    // wouldn't compile alongside their replacements) before partitioning.
    const code = block.code
      .split('\n')
      .filter((line) => !codeRemovedAnnotation.test(line))
      .join('\n')
    const { imports, body } = partitionImports(code)
    const wrapped =
      `${imports.join('\n')}\n` +
      `async function __example() {\n${body}\n}\n` +
      `void __example\nexport {}\n`
    fsSync.writeFileSync(path.join(checkDir, filename), wrapped)

    index.set(filename, block)
  }

  const extendsPath = path.relative(checkDir, path.resolve(cwd, project))
  fsSync.writeFileSync(
    path.join(checkDir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: extendsPath,
        compilerOptions: {
          types: ['node'],
          noUnusedLocals: false,
          noUnusedParameters: false,
          noEmit: true,
        },
        include: ['./**/*.ts'],
      },
      null,
      2,
    ),
  )

  return index
}

/**
 * Splits top-level static import declarations out of a snippet.
 *
 * Tokenizes the snippet with the TypeScript scanner and tracks nesting so
 * only genuine top-level `import` declarations are hoisted — dynamic
 * `import()`, `import.meta`, and `import` look-alikes inside string,
 * template, or regex literals are left in the body.
 */
function partitionImports(code: string): { imports: readonly string[]; body: string } {
  const { SyntaxKind, createScanner } = ast()
  const scanner = createScanner(/*skipTrivia*/ true, /*languageVariant*/ undefined, code)

  /**
   * Consumes the right-hand side of `import x = ...` (e.g. `require('mod')`
   * or a qualified name) and returns the offset just after its final token.
   */
  function scanImportEqualsTail(): number {
    let parens = 0
    let lastEnd = scanner.getTokenEnd()
    while (true) {
      const next = scanner.lookAhead(() => ({
        token: scanner.scan(),
        lineBreak: scanner.hasPrecedingLineBreak(),
      }))
      if (next.token === SyntaxKind.EndOfFile) return lastEnd
      if (parens === 0 && next.lineBreak) return lastEnd
      scanner.scan()
      if (next.token === SyntaxKind.OpenParenToken) parens++
      else if (next.token === SyntaxKind.CloseParenToken) {
        if (--parens <= 0) return scanner.getTokenEnd()
      } else if (parens === 0 && next.token === SyntaxKind.SemicolonToken)
        return scanner.getTokenEnd()
      lastEnd = scanner.getTokenEnd()
    }
  }

  /**
   * Consumes one import declaration (cursor sitting on the `import` keyword)
   * and returns the offset just after its final token.
   */
  function scanImportDeclaration(): number {
    let end = -1
    let clauseDepth = 0
    while (end === -1) {
      const token = scanner.scan()
      if (token === SyntaxKind.EndOfFile) return scanner.getTokenFullStart()
      if (token === SyntaxKind.OpenBraceToken) clauseDepth++
      else if (token === SyntaxKind.CloseBraceToken) clauseDepth--
      else if (clauseDepth === 0) {
        // The module specifier ends the declaration (side-effect imports and
        // `from` clauses alike); `=` switches to `import x = ...` handling.
        if (token === SyntaxKind.StringLiteral) end = scanner.getTokenEnd()
        else if (token === SyntaxKind.EqualsToken) end = scanImportEqualsTail()
      }
    }

    // `with { ... }` / `assert { ... }` import attributes extend the declaration.
    const hasAttributes = scanner.lookAhead(() => {
      const token = scanner.scan()
      if (token !== SyntaxKind.WithKeyword && token !== SyntaxKind.AssertKeyword) return false
      return scanner.scan() === SyntaxKind.OpenBraceToken
    })
    if (hasAttributes) {
      scanner.scan() // `with` / `assert`
      let depth = 0
      attributes: while (true) {
        switch (scanner.scan()) {
          case SyntaxKind.EndOfFile:
            break attributes
          case SyntaxKind.OpenBraceToken:
            depth++
            break
          case SyntaxKind.CloseBraceToken:
            if (--depth === 0) {
              end = scanner.getTokenEnd()
              break attributes
            }
            break
        }
      }
    }

    // A trailing semicolon is part of the declaration.
    if (scanner.lookAhead(() => scanner.scan() === SyntaxKind.SemicolonToken)) {
      scanner.scan()
      end = scanner.getTokenEnd()
    }

    return end
  }

  const ranges: { start: number; end: number }[] = []
  // Brace depth recorded at each `${` so the matching `}` resumes its template.
  const templateStack: number[] = []
  let braceDepth = 0
  let groupDepth = 0
  let prevToken: number | undefined

  while (true) {
    let token: number = scanner.scan()
    if (token === SyntaxKind.EndOfFile) break

    switch (token) {
      case SyntaxKind.OpenBraceToken:
        braceDepth++
        break
      case SyntaxKind.CloseBraceToken:
        if (templateStack.length > 0 && braceDepth === templateStack[templateStack.length - 1]) {
          token = scanner.reScanTemplateToken(/*isTaggedTemplate*/ false)
          if (token === SyntaxKind.TemplateTail) templateStack.pop()
        } else braceDepth--
        break
      case SyntaxKind.TemplateHead:
        templateStack.push(braceDepth)
        break
      case SyntaxKind.OpenParenToken:
      case SyntaxKind.OpenBracketToken:
        groupDepth++
        break
      case SyntaxKind.CloseParenToken:
      case SyntaxKind.CloseBracketToken:
        groupDepth--
        break
      case SyntaxKind.SlashToken:
      case SyntaxKind.SlashEqualsToken:
        if (isRegexStartContext(prevToken, SyntaxKind)) token = scanner.reScanSlashToken()
        break
      case SyntaxKind.ImportKeyword: {
        // Only top-level `import` declarations are hoisted.
        if (braceDepth !== 0 || groupDepth !== 0 || templateStack.length > 0) break
        // `foo.import` is a property access, not a declaration.
        if (prevToken === SyntaxKind.DotToken || prevToken === SyntaxKind.QuestionDotToken) break
        // `import(...)` and `import.meta` are expressions, not declarations.
        const next = scanner.lookAhead(() => scanner.scan())
        if (next === SyntaxKind.OpenParenToken || next === SyntaxKind.DotToken) break

        const start = scanner.getTokenStart()
        const end = scanImportDeclaration()
        if (end > start) ranges.push({ start, end: trailingImportEnd(code, end) })
        break
      }
    }

    prevToken = token
  }

  if (ranges.length === 0) return { imports: [], body: code }

  const imports = ranges.map((range) => code.slice(range.start, range.end).trim())
  let body = ''
  let offset = 0
  for (const range of ranges) {
    body += code.slice(offset, range.start)
    offset = range.end
  }
  body += code.slice(offset)

  return { imports, body }
}

function trailingImportEnd(code: string, end: number): number {
  const lineEnd = code.indexOf('\n', end)
  const nextLine = lineEnd === -1 ? code.length : lineEnd
  const trailing = code.slice(end, nextLine)
  if (/^\s*(?:;?\s*)?(?:\/\/.*)?$/.test(trailing)) return nextLine
  return end
}

type RunTscOptions = {
  cwd: string
  checkDir: string
  index: Map<string, Block>
}

function runTsc(options: RunTscOptions): readonly TypeError[] {
  const { cwd, checkDir, index } = options
  // Nothing to check (e.g. every block was skipped via `@noErrors`).
  if (index.size === 0) return []
  const tsc = findBin({ bin: 'tsc', cwd })

  let stdout = ''
  try {
    stdout = cp.execFileSync(tsc, ['-p', `${checkDir}/tsconfig.json`, '--pretty', 'false'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    })
  } catch (error) {
    stdout = (error as { stdout?: string; stderr?: string }).stdout ?? ''
    stdout += (error as { stderr?: string }).stderr ?? ''
  }

  if (!stdout.trim()) return []

  const errors: TypeError[] = []
  for (const raw of stdout.split('\n')) {
    if (!raw.includes('error TS')) continue
    const match = raw.match(/(?:\.examples\/check\/|check\/)?([^(/]+)\((\d+),(\d+)\): (.+)/)
    if (!match) {
      errors.push({ block: undefined, line: undefined, column: undefined, message: raw, raw })
      continue
    }
    const [, filename, line, col, message] = match
    errors.push({
      block: index.get(filename!),
      line: Number(line!),
      column: Number(col!),
      message: message!,
      raw,
    })
  }
  return errors
}

type FormatBlocksOptions = {
  blocks: readonly Block[]
  formatOptions: FormatOptions
}

async function formatBlocks(options: FormatBlocksOptions): Promise<Map<Block, string>> {
  const { blocks, formatOptions } = options

  const fixes = new Map<Block, string>()
  for (const block of blocks) {
    const original = `${block.code}\n`
    const filename = `${path.basename(block.file, path.extname(block.file))}__${block.index}.ts`
    const result = await oxfmt.format(filename, original, formatOptions)
    if (result.errors.some((e) => e.severity === 'Error')) continue
    if (result.code !== original) fixes.set(block, result.code)
  }
  return fixes
}

type FindBinOptions = {
  /** Binary name to find. */
  bin: string
  /** Working directory to start searching from. */
  cwd: string
}

function findBin(options: FindBinOptions): string {
  const { bin, cwd } = options

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
