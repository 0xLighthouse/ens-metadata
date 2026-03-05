import { globSync } from 'node:fs'
import { defineConfig } from 'tsup'

const commandEntries = Object.fromEntries(
  globSync('src/commands/**/*.tsx').map((file) => [
    file.replace(/^src\//, '').replace(/\.tsx$/, ''),
    file,
  ])
)

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
    ...commandEntries,
  },
  format: ['esm'],
  target: 'node22',
  dts: !process.env.SKIP_DTS,
  clean: true,
  noExternal: ['@ens-node-metadata/shared', '@ens-node-metadata/schemas'],
})
