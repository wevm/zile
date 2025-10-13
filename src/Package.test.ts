import * as fs from 'node:fs/promises'
import path from 'node:path'
import { setupRepos, tree } from '../test/utils.js'
import * as Package from './Package.js'

const repos = () => setupRepos().then(({ repos }) => repos)

describe.each(await repos())('$relative: Package.build', ({ cwd }) => {
  test('default', async () => {
    const result = await Package.build({
      cwd,
    })
    expect(result).toMatchSnapshot('result')
    expect(
      [await fs.readFile(path.resolve(cwd, 'package.json'), 'utf-8'), await tree(cwd)].join('\n'),
    ).toMatchSnapshot('output')
  })
})

describe.each(await repos())('$relative: Package.transpile', ({ cwd }) => {
  test('default', async () => {
    const result = await Package.transpile({
      cwd,
    })
    expect(result).toMatchSnapshot('result')
    expect(await tree(cwd)).toMatchSnapshot('tree')
  })
})
