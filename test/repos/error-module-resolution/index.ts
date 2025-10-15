export function hello(options: hello.Options = {}) {
  console.log('Hello!', options.value)
}

export declare namespace hello {
  type Options = {
    value?: string | undefined
  }
}
