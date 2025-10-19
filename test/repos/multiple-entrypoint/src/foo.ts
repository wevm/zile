export function foo(options: foo.Options = {}) {
  console.log('Hello, foo!', options.value)
}

export declare namespace foo {
  type Options = {
    value?: string | undefined
  }
}

export function bar(options: bar.Options = {}) {
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
