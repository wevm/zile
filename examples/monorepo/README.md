# Monorepo Example

This example demonstrates monorepo usage of Zile. 

Using Zile in a monorepo is not much different from using it in a single package. 
All you need to do is add scripts to your root `package.json` file to concurrently run the
`build` script in all packages.

```sh
npm run build  # Builds and transpiles the package
npm run dev    # Create symlinks for development
```

> Running the above commands will transform your `package.json`s into a valid package.json file for distribution.
> This example does not include the generated output for simplicity.