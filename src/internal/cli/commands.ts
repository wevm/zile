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
