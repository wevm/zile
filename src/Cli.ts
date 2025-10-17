#!/usr/bin/env bun
import { cac } from 'cac'
import pkgJson from '../package.json' with { type: 'json' }
import { build } from './cli/commands/build.ts'

/**
 * Runs the CLI with the given arguments.
 *
 * @param options - Options for running the CLI
 * @returns Promise that resolves when the CLI completes
 */
export async function run(options: run.Options): Promise<void> {
  const { args } = options

  const cli = cac(pkgJson.name)
  cli.version(pkgJson.version)

  build(cli.command('[root]', ''))
  build(cli.command('build', 'Build a package'))

  cli.help()
  cli.parse(args)
}

export declare namespace run {
  type Options = {
    /** Command-line arguments to parse */
    args: string[]
  }
}

// Run the CLI if this module is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run({ args: process.argv }).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
