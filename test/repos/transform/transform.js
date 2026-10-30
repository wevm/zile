export default (code, file) =>
  `// ${file}\n${code
    .replace("import { flags } from './flags.js';\n", '')
    .replaceAll('flags.newEncoder', 'false')}`
