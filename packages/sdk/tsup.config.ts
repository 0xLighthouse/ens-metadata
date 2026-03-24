import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    delta: 'src/delta.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  noExternal: ['@ens-node-metadata/shared', '@ens-node-metadata/schemas'],
})
