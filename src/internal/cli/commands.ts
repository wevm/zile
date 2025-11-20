import * as child_process from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as clack from '@clack/prompts'
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

export async function createNew(command: Command) {
  return command
    .option('--pnpm', 'Use pnpm as package manager')
    .option('--bun', 'Use bun as package manager')
    .action(async (options: createNew.CommandOptions) => {
      clack.intro('Create a new zile project')

      try {
        // Determine package manager from flags or detect from invocation
        let packageManager = 'npm'
        if (options.pnpm) packageManager = 'pnpm'
        else if (options.bun) packageManager = 'bun'
        else {
          // Auto-detect from how the command was invoked
          const userAgent = process.env.npm_config_user_agent || ''
          const execPath = process.env.npm_execpath || ''
          
          if (userAgent.includes('pnpm') || execPath.includes('pnpm')) packageManager = 'pnpm'
          else if (userAgent.includes('bun') || execPath.includes('bun')) packageManager = 'bun'
          else if (userAgent.includes('yarn') || execPath.includes('yarn')) packageManager = 'yarn'
          else if (userAgent.includes('npm') || execPath.includes('npm')) packageManager = 'npm'
        }

        // Get package name and directory in single prompt
        const packageName = await clack.text({
          message: 'Package name',
          placeholder: 'my-package',
          validate: (value: string | undefined) => {
            if (!value) return 'Package name is required'
            if (!/^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(value))
              return 'Invalid package name. Must be lowercase, can contain hyphens, and optionally scoped with @org/'
          },
        })

        if (clack.isCancel(packageName)) {
          clack.cancel('Operation cancelled')
          process.exit(0)
        }

        const targetDir = packageName
        const targetPath = path.resolve(process.cwd(), targetDir)

        // Check if directory exists
        if (fs.existsSync(targetPath)) {
          clack.cancel(`Directory ${targetDir} already exists`)
          process.exit(1)
        }

        // Start spinner for file operations
        const spinner = clack.spinner()
        spinner.start('Creating project')

        const templatePath = path.join(import.meta.dirname, '../../../template')

        // Recursively copy
        function cp(src: string, dest: string): void {
          // Create destination directory
          fs.mkdirSync(dest, { recursive: true })

          // Read source directory
          const entries = fs.readdirSync(src, { withFileTypes: true })

          for (const entry of entries) {
            const srcPath = path.join(src, entry.name)
            const destName = entry.name.startsWith('~') ? entry.name.slice(1) : entry.name
            const destPath = path.join(dest, destName)

            if (entry.isDirectory()) cp(srcPath, destPath)
            else fs.copyFileSync(srcPath, destPath)
          }
        }
        cp(templatePath, targetPath)

        // Replace "replace-me" in all files
        function replace(dir: string) {
          const entries = fs.readdirSync(dir, { withFileTypes: true })

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)

            if (entry.isDirectory()) replace(fullPath)
            else
              try {
                const content = fs.readFileSync(fullPath, 'utf-8')
                const updated = content.replace(/replace-me/g, packageName as string)
                if (content !== updated) fs.writeFileSync(fullPath, updated, 'utf-8')
              } catch {}
          }
        }
        replace(targetPath)

        // Add packageManager to package.json (before [!start-pkg] marker)
        const packageJsonPath = path.join(targetPath, 'package.json')
        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8')
        const packageJson = JSON.parse(packageJsonContent)

        // Fetch latest version of the package manager
        const { version } = await fetch(`https://registry.npmjs.org/${packageManager}/latest`).then(
          (response) => response.json(),
        )

        // Find keys and insert packageManager before [!start-pkg]
        const keys = Object.keys(packageJson)
        const markerIndex = keys.indexOf('[!start-pkg]')

        // Create new object with packageManager before marker
        const newPackageJson: Record<string, unknown> = {}
        for (let i = 0; i < keys.length; i++) {
          if (i === markerIndex) newPackageJson.packageManager = `${packageManager}@${version}`
          // biome-ignore lint/style/noNonNullAssertion: _
          newPackageJson[keys[i]!] = packageJson[keys[i]!]
        }

        fs.writeFileSync(packageJsonPath, `${JSON.stringify(newPackageJson, null, 2)}\n`, 'utf-8')

        // Initialize git
        spinner.message('Initializing git repository')
        try {
          child_process.execSync('git init', { cwd: targetPath, stdio: 'ignore' })
          child_process.execSync('git add .', { cwd: targetPath, stdio: 'ignore' })
          child_process.execSync('git commit -m "Initial commit"', {
            cwd: targetPath,
            stdio: 'ignore',
          })
        } catch {}

        spinner.stop('Project created successfully')

        clack.outro(`
Next steps:
  cd ${targetDir}
  ${packageManager} install     # Install dependencies
  ${packageManager} run build   # Builds and transpiles the package
  ${packageManager} run dev     # Create symlinks for development 
  ${packageManager} run test    # Run tests
        `)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        clack.cancel(`Failed to create project: ${errorMessage}`)
        process.exit(1)
      }
    })
}

export declare namespace createNew {
  type CommandOptions = {
    /** Use bun as package manager */
    bun?: boolean | undefined
    /** Use npm as package manager */
    npm?: boolean | undefined
    /** Use pnpm as package manager */
    pnpm?: boolean | undefined
  }
}
