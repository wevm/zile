declare module '*.mdx' {
  export default function MDXContent(props: Record<string, unknown>): JSX.Element
}

declare module 'virtual:config' {
  export const config: Record<string, unknown>
}
