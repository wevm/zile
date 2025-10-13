import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export default async () => {
  return () => fs.rm(path.resolve(import.meta.dirname, '.tmp'), { recursive: true }).catch(() => {})
}
