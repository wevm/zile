import type * as vitest from 'vitest'

const cwd = process.cwd()

/**
 * Custom snapshot serializer that automatically replaces absolute paths with relative paths
 */
expect.addSnapshotSerializer({
  test(val: unknown): boolean {
    if (!val || typeof val !== 'object') return false

    const hasAbsolutePaths = (value: unknown): boolean => {
      if (value instanceof Error) return value.message.includes(cwd)
      if (typeof value === 'string') return value.includes(cwd)
      if (Array.isArray(value)) return value.some(hasAbsolutePaths)
      if (value && typeof value === 'object') return Object.values(value).some(hasAbsolutePaths)
      return false
    }

    return hasAbsolutePaths(val)
  },

  serialize(val: unknown, config, indentation, depth, refs, printer): string {
    const trimPaths = (value: unknown): unknown => {
      if (typeof value === 'string')
        return value
          .replaceAll(cwd, '')
          .replace(
            /\/test\/\.tmp\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g,
            '',
          )
      if (value instanceof Error) return trimPaths(value.message)
      if (Array.isArray(value)) return value.map(trimPaths)
      if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(value)) result[key] = trimPaths(val)
        return result
      }
      return value
    }
    return printer(trimPaths(val), config, indentation, depth, refs)
  },
} satisfies vitest.SnapshotSerializer)
