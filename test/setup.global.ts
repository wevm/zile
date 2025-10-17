import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export default async () => {
  return async () => {
    await fs
      .rm(path.resolve(import.meta.dirname, '..', 'src', '.tmp'), { recursive: true })
      .catch(() => {})
    await fs.rm(path.resolve(import.meta.dirname, '.tmp'), { recursive: true }).catch(() => {})
  }
}
