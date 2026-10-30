import { flags } from './flags.js'

/** Encodes a value. */
export function encode(value: string): string {
  // Replaced with `false` by `define.js`.
  if (flags.newEncoder) return `v2:${value}`
  return `v1:${value}`
}
