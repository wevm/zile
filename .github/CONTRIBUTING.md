# Contributing

Thank you for your interest in contributing to Zile! This guide will help you understand our development process and coding standards.

## Getting Started

```bash
curl -fsSL https://bun.sh/install | bash # Install Bun

git clone https://github.com/wevm/zile.git && cd zile # Clone
bun install # Install dependencies
bun run test # Run tests
```

## Development Workflow

### Available Scripts

```bash
bun run build # Build project
bun run check # Format and lint code
bun run check:types # Check types
bun run test # Run tests
```

### For AI Agents

**If you're an AI assistant helping with this codebase:**

When you observe patterns or style preferences that emerge during development or code review, please proactively update this guide to capture them. This helps maintain consistency and provides clear guidance for future contributions (both human and AI).

Look for opportunities to document:
- New coding patterns or conventions
- Style preferences that come up in discussions
- Refactoring patterns that improve code quality
- Any "rules" or preferences expressed during collaboration

## Proposing a Change

### 1. Set up repository

Follow [Getting Started](#getting-started) to set up the repository.

### 2. Create a branch

```bash
git checkout -b feature/my-feature
```

### 3. Make changes and add tests

Make the changes required, and ensure that your changes are covered by tests. Run `bun run test` to run tests.

### 5. Add changeset

When adding new features or fixing bugs, we'll need to bump the package versions. We use [Changesets](https://github.com/changesets/changesets) to do this.

```bash
bun run changeset
```

> Changesets use past tense verbs (e.g., `Added something`, `Fixed something`).

### 6. Commit your changes

Commit messages should use the [Imperative Mood](https://en.wikipedia.org/wiki/Imperative_mood) (e.g., `feat: add something`, `fix: something`).

```bash
git commit -m "feat: add thing"
```

### 7. Open a pull request

When opening a pull request, titles should use the [Imperative Mood](https://en.wikipedia.org/wiki/Imperative_mood) (e.g., `Add something`, `Fix something`).

```bash
git push origin feature/my-feature
```

## Coding Standards

### Import Style

**Always use namespace imports, never named imports:**

✅ **Good:**
```typescript
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
```

❌ **Bad:**
```typescript
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
```

### Function Structure

**All exported functions must have a corresponding namespace for types:**

✅ **Good:**
```typescript
/**
 * Does something useful.
 * 
 * @param options - Configuration options
 * @returns Result of the operation
 */
export function doSomething(options: doSomething.Options) {
  const value = options.value ?? 'default'
  // ... implementation
}

export declare namespace doSomething {
  interface Options {
    /** Description of value */
    value?: string | undefined
  }
}
```

❌ **Bad:**
```typescript
// Don't inline types
export function doSomething(options: { value?: string }) {
  // ...
}

// Don't destructure in parameters
export function doSomething({ value = 'default' }: Options) {
  // ...
}
```

### Parameter Handling

**Never destructure parameters in function definitions:**

✅ **Good:**
```typescript
export function process(options: process.Options) {
  const { input = 'default', verbose = false } = options
  // ... implementation
}
```

❌ **Bad:**
```typescript
export function process({ input = 'default', verbose = false }: process.Options) {
  // ... implementation
}
```

### Documentation

**All exported functions must have complete JSDoc:**

Required JSDoc tags:
- `@param` for each parameter with description
- `@returns` or `@return` for return value with description

✅ **Good:**
```typescript
/**
 * Finds all packages matching the given patterns.
 * 
 * @param options - Search options
 * @returns Array of package paths
 */
export async function findPackages(options: findPackages.Options) {
  // ... implementation
}
```

❌ **Bad:**
```typescript
// Missing parameter and return documentation
/**
 * Finds all packages matching the given patterns.
 */
export async function findPackages(options: findPackages.Options) {
  // ... implementation
}
```

### Control Flow and Conditionals

**Avoid ternaries, use IIFEs for conditional assignments:**

✅ **Good:**
```typescript
const globPattern = (() => {
  if (pattern.endsWith('package.json')) return pattern
  return `${pattern}/package.json`
})()
```

❌ **Bad:**
```typescript
const globPattern = pattern.endsWith('package.json') 
  ? pattern 
  : `${pattern}/package.json`
```

**Remove curly braces when possible:**

✅ **Good:**
```typescript
for (const item of items)
  process(item)

if (condition)
  doSomething()
```

❌ **Bad:**
```typescript
for (const item of items) {
  process(item)
}

if (condition) {
  doSomething()
}
```

### TypeScript Guidelines

- Use explicit type annotations for function parameters and return types
- Prefer `type` over `interface`

## Testing

### Running Tests

```bash
bun run test # Run all tests
bun run test example.test.ts # Run a specific test file
bun run test -u # Update snapshots
```

### Writing Tests

- Use descriptive test names that explain what is being tested
- Update snapshots when intentional changes affect output
- Ensure all tests pass before submitting a PR

**Test naming convention:**

✅ **Good:**
```typescript
it('finds package.json with default options', async () => {
  // test implementation
})

it('returns empty array when no packages found', async () => {
  // test implementation
})
```

❌ **Bad:**
```typescript
it('should find package.json with default options', async () => {
  // test implementation
})

it('should return empty array when no packages found', async () => {
  // test implementation
})
```
