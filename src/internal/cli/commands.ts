import type { Command } from 'cac'
// import * as Packages from '../../Packages.js'
import * as Package from '../../Package.js'

export async function build(command: Command) {
  return command
    .option('--cwd <directory>', 'Working directory to build')
    .option('--includes <patterns...>', 'Glob patterns to include')
    .action(async (options1: build.Options, options2: build.Options) => {
      const { cwd = process.cwd() } = typeof options1 === 'object' ? options1 : options2
      console.log(`Building package at ${cwd}`)
      await Package.build({ cwd })
      console.log('Build completed successfully')
    })
}

export declare namespace build {
  type Options = {
    /** Working directory to build */
    cwd?: string | undefined
  }
}
