import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/host/index.ts',
    client: 'src/client/index.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  clean: true,
  dts: false,
  treeshake: true,
  tsconfig: 'tsconfig.build.json',
})
