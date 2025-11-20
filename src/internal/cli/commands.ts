import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Command } from 'cac'
import * as Package from '../../Package.js'

export async function build(command: Command, options: build.Options = {}) {
  const { link = false } = options
  return command
    .option('--cwd <directory>', 'Working directory to build')
    .option('--includes <patterns...>', 'Glob patterns to include')
    .option('--project <path>', 'Path to tsconfig.json file, relative to the working directory.')
    .option('--tsgo', 'Use tsgo for transpilation')
    .action(async (options1: build.CommandOptions, options2: build.CommandOptions) => {
      const {
        cwd = process.cwd(),
        project = './tsconfig.json',
        tsgo = false,
      } = typeof options1 === 'object' ? options1 : options2
      console.log(`→ ${link ? 'Linking' : 'Building'} package at ${cwd}`)
      await Package.build({ cwd, link, project, tsgo })
      console.log(`✔︎ ${link ? 'Linking' : 'Building'} completed successfully`)
    })
}

export declare namespace build {
  type Options = {
    /** Whether to link output files to source files for development */
    link?: boolean | undefined
  }

  type CommandOptions = {
    /** Working directory to build */
    cwd?: string | undefined
    /** Path to tsconfig.json file, relative to the working directory. @default './tsconfig.json' */
    project?: string | undefined
    /** Use tsgo for transpilation */
    tsgo?: boolean | undefined
  }
}

export async function preparePublish(command: Command) {
  return command
    .option('--cwd <directory>', 'Working directory to publish from')
    .action(async (options: preparePublish.CommandOptions) => {
      const { cwd = process.cwd() } = options

      console.log(`→ Preparing package at ${cwd}`)

      // Build the package
      await Package.build({ cwd })

      // Get the package.json path
      const packageJsonPath = path.join(cwd, './package.json')

      // Copy package.json to a temporary file
      fs.copyFileSync(packageJsonPath, packageJsonPath.replace('.json', '.tmp.json'))

      // Read package.json as text to find the marker position
      const content = fs.readFileSync(packageJsonPath, 'utf-8')
      const data = JSON.parse(content)

      // Find all keys that appear before "[!start-pkg]" in the file
      const keys = Object.keys(data)
      const markerIndex = keys.indexOf('[!start-pkg]')

      // Remove all keys up to and including the marker
      const keysToRemove = keys.slice(0, markerIndex + 1)
      for (const key of keysToRemove) delete data[key]

      // Write back to package.json
      fs.writeFileSync(packageJsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')

      console.log(`✔︎ Package at ${cwd} prepared successfully`)
    })
}

export declare namespace preparePublish {
  type CommandOptions = build.CommandOptions
}

export async function postPublish(command: Command) {
  return command
    .option('--cwd <directory>', 'Working directory to publish from')
    .action(async (options: postPublish.CommandOptions) => {
      const { cwd = process.cwd() } = options

      const packageJsonPath = path.join(cwd, './package.json')
      const tmpPackageJsonPath = path.join(cwd, './package.tmp.json')
      if (fs.existsSync(tmpPackageJsonPath)) fs.renameSync(tmpPackageJsonPath, packageJsonPath)
    })
}

export declare namespace postPublish {
  type CommandOptions = {
    /** Working directory to publish from */
    cwd?: string | undefined
  }
}
