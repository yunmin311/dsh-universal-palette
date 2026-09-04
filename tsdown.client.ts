/**
 * Build config for the DSH client bundle.
 *
 * Modeled after the upstream `@deepseek-ai/dsh-client/tsdown.client.ts`
 * at the locked upstream SHA
 * `deepseek-ai/deepseek-harness@76fda729799fe9b3848dbe2c211d4b231032b81e`.
 *
 * The bundle is consumed by the DSH browser shell through
 * `window.__ModuleLoader__.load({ id, factory })` (see
 * `packages/client/modules/src/client/system.ts` at the locked SHA).
 * The shell runs the bundle as a CJS module: the banner/footer wrap
 * defines a `module.exports` and a CJS-style `factory(require)`
 * callable. Every `@deepseek-ai/*` value import must either be
 * declared as a module-table entry (declared in `dsh.client.inject`
 * with a row that already exists in the active composition) or
 * inlined as a vendored lib. The purity-gate plugin enforces that
 * at build time.
 *
 * The Node-half `lib/index.js` ships too because the loader keeps
 * both faces on the same artifact dir so a re-run of `pnpm run
 * build` does not need two separate build invocations.
 */
import { defineConfig, type UserConfig } from 'tsdown'

const ID = '@yunmin311/dsh-universal-palette'

/** Default DSH client externals: every module-table entry the shell
 *  seeds by default (`PLATFORM_MODULES`). Our plugin's own `inject`
 *  list must be a subset of the actual graph or the shell throws
 *  `inject: <name> not found` at composition. We do not name them
 *  in `dsh.client.external` because none of those value imports are
 *  used at runtime — the client face is a UI overlay; commands and
 *  sessions are reached through Cordis services, not direct value
 *  imports. This is the upstream's `clientBundle(...)` purity rule.
 */
const SHARED_INJECT_NAMES: ReadonlySet<string> = new Set([
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-commands',
  '@deepseek-ai/dsh-client-ui-sessions',
  '@deepseek-ai/dsh-client-ui-model-selection',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-connection',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-modules',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-test-runtime',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-home-paths',
  '@deepseek-ai/dsh-session-query',
  '@deepseek-ai/dsh-launch-environment',
])

function isSharedInject(name: string): boolean {
  return SHARED_INJECT_NAMES.has(name)
}

const clientConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (specifier: string): boolean => isSharedInject(specifier),
    alwaysBundle: (specifier: string): boolean => {
      // Anything not on the shared-inject list is inlined. Our
      // package has no npm dependencies (DSH code paths are reached
      // through cordis services), so any value import we receive
      // that is not on the shared list would be a runtime throw.
      // The build-time purity gate below would have already failed.
      if (specifier.startsWith('@deepseek-ai/')) return false
      return !specifier.startsWith('node:')
    },
  },
  inputOptions: {
    resolve: {
      conditionNames: [
        (process.env.NODE_ENV ?? 'production') === 'development' ? 'development' : 'production',
        'browser',
        'import',
        'module',
        'default',
      ],
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  plugins: [
    {
      name: 'dsh-universal-palette-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (isSharedInject(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not in the default client externals or ${ID}'s dsh.client.inject, an inline-safe wire layer, or a generated /remote contribution — ` +
            'cross-plugin value imports are forbidden; declare a non-default module request or collaborate through cordis services ' +
            '(type-only imports are erased and never reach this gate)',
        )
      },
    },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapExcludeSources: false,
    banner:
      "window.__ModuleLoader__.load({ id: " +
      JSON.stringify(ID) +
      ", factory: (require) => {",
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

const libConfig: UserConfig = {
  name: `${ID}/lib`,
  entry: { index: 'src/host/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'neutral',
  dts: { outDir: 'lib/types' },
  sourcemap: true,
  clean: false,
}

export default defineConfig([clientConfig, libConfig])
