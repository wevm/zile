import type { Command } from 'cac'
import * as Packages from '../../Package.ts'

export async function build(command: Command) {
  return command
    .option('--cwd <directory>', 'Working directory to build')
    .action(async (_: string, options: build.Options) => {
      const { cwd = process.cwd() } = options
      console.log(`Building package(s) in ${cwd}`)
      await Packages.build({ cwd })
      console.log('Build completed successfully')
    })
}

export declare namespace build {
  type Options = {
    /** Working directory to build */
    cwd?: string | undefined
  }
}
