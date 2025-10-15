import * as fs from 'node:fs/promises'
import path from 'node:path'
import { setupRepos, tree } from '../test/utils.js'
import * as Package from './Package.js'

const repos = () =>
  setupRepos().then(({ repos }) => repos.filter(({ relative }) => !relative.includes('invalid-')))

describe.each(await repos())('$relative: Package.build', ({ cwd }) => {
  test('default', async () => {
    if (cwd.includes('error-')) {
      await expect(Package.build({ cwd })).rejects.toMatchSnapshot('error')
      return
    }

    const result = await Package.build({
      cwd,
    })
    expect(result).toMatchSnapshot('result')
    const packageJsonString = await fs.readFile(path.resolve(cwd, 'package.json'), 'utf-8')
    const packageJson = JSON.parse(packageJsonString)
    expect([packageJsonString, await tree(cwd)].join('\n\n')).toMatchSnapshot('output')
    expect(await fs.readFile(path.resolve(cwd, packageJson.main), 'utf-8')).toMatchSnapshot('main')
    expect(await fs.readFile(path.resolve(cwd, packageJson.types), 'utf-8')).toMatchSnapshot(
      'types',
    )
  })
})

describe.each(await repos())('$relative: Package.transpile', ({ cwd }) => {
  test('default', async () => {
    if (cwd.includes('error-')) {
      await expect(Package.transpile({ cwd })).rejects.toMatchSnapshot('error')
      return
    }

    const result = await Package.transpile({
      cwd,
    })
    expect(result).toMatchSnapshot('result')
    expect(await tree(cwd)).toMatchSnapshot('tree')
  })
})
