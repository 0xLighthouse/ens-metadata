import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  dts: !process.env.SKIP_DTS,
  clean: true,
  noExternal: ['@ensmetadata/shared', '@ensmetadata/schemas'],
})
