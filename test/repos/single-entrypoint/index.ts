import { bar as bar1, foo as foo1 } from './foo.js'

export function foo(options: foo.Options = {}) {
  foo1(options)
  console.log('Hello, foo!', options.value)
}

export declare namespace foo {
  type Options = {
    value?: string | undefined
  }
}

export function bar(options: bar.Options = {}) {
  bar1(options)
  console.log('Hello, bar!', options.value)
}

export namespace bar {
  export type Options = {
    value?: string | undefined
  }

  export function baz(options: Options = {}) {
    console.log('Hello, baz!', options.value)
  }
}
