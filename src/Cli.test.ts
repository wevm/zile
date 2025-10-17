import { spawn } from 'node:child_process'
import { setupRepos, tree } from '../test/utils.js'

const repos = () =>
  setupRepos().then(({ repos }) => repos.filter(({ relative }) => !relative.includes('invalid-')))

describe.each(await repos())('$relative: Cli.run', ({ cwd }) => {
  test('default', async () => {
    if (cwd.includes('error-')) return

    const result = spawn(
      'bun',
      ['./Cli.ts', '--cwd', cwd, '--includes', '**,!**/error-*,!**/node_modules/**'],
      { cwd: import.meta.dirname },
    )

    const promise = Promise.withResolvers<void>()
    result.on('close', (code) =>
      code === 0
        ? promise.resolve()
        : promise.reject(new Error(`Child process exited with code ${code}`)),
    )
    await promise.promise

    expect(await tree(cwd)).toMatchSnapshot('output tree')
  })
})
