#!/usr/bin/env node
import { cac } from 'cac'
import * as commands from './internal/cli/commands.js'
import pkgJson from './internal/package.json' with { type: 'json' }

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

  commands.build(cli.command('[root]', ''))
  commands.build(cli.command('build', 'Build package'))
  commands.build(cli.command('dev', 'Resolve package exports to source for development'), {
    link: true,
  })

  cli.help()
  cli.parse(args)
}

export declare namespace run {
  type Options = {
    /** Command-line arguments to parse */
    args: string[]
  }
}

run({ args: process.argv }).catch((error) => {
  console.error(error)
  process.exit(1)
})
