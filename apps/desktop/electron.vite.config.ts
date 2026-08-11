import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Exact commit the build was compiled from, surfaced in the editor status bar
// via getAppInfo().commit. Resolved once at config load; '' outside a git
// checkout (e.g. a source tarball) so the footer degrades to version-only.
function gitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    return ''
  }
}

const INTERNAL_WORKSPACE_PACKAGES = [
  '@zennotes/app-core',
  '@zennotes/bridge-contract',
  '@zennotes/shared-domain',
  '@zennotes/shared-ui'
]

export const PACKAGED_CLI_RUNTIME_PACKAGES = ['@modelcontextprotocol/sdk']

// Bundled INTO the main chunk instead of externalized to node_modules. Pure-JS
// packages whose transitive deps don't survive electron-builder's node_modules
// collection under npm-workspace hoisting (e.g. isomorphic-git → sha.js →
// call-bind-apply-helpers went missing from app.asar). Bundling makes the main
// process self-contained.
const MAIN_BUNDLED_RUNTIME_PACKAGES = ['isomorphic-git']

const MAIN_EXTERNALIZE_EXCLUSIONS = [
  ...INTERNAL_WORKSPACE_PACKAGES,
  ...PACKAGED_CLI_RUNTIME_PACKAGES,
  ...MAIN_BUNDLED_RUNTIME_PACKAGES
]

function rendererManualChunk(id: string): string | undefined {
  const normalizedId = id.split('\\').join('/')
  if (normalizedId.endsWith('/packages/app-core/src/lib/wikilinks.ts')) {
    return 'app-wikilinks'
  }
  if (normalizedId.endsWith('/packages/app-core/src/lib/local-assets.ts')) {
    return 'app-local-assets'
  }
  if (normalizedId.endsWith('/packages/app-core/src/store.ts')) {
    return 'app-store'
  }

  if (!id.includes('node_modules')) return undefined

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/zustand/')) {
    return 'vendor-react'
  }

  if (id.includes('/@codemirror/language-data/')) {
    return 'vendor-editor-languages'
  }

  if (
    id.includes('/@codemirror/') ||
    id.includes('/codemirror/') ||
    id.includes('/@lezer/') ||
    id.includes('/@replit/codemirror-vim/')
  ) {
    return 'vendor-editor'
  }

  if (
    id.includes('/remark-') ||
    id.includes('/rehype-') ||
    id.includes('/unified/') ||
    id.includes('/unist-util-visit/') ||
    id.includes('/gray-matter/') ||
    id.includes('/katex/')
  ) {
    return 'vendor-markdown'
  }

  if (id.includes('/highlight.js/')) {
    return 'vendor-highlight'
  }

  if (id.includes('/mermaid/') || id.includes('/cytoscape/') || id.includes('/dagre/')) {
    return 'vendor-mermaid'
  }

  if (id.includes('/jsxgraph/')) {
    return 'vendor-jsxgraph'
  }

  if (id.includes('/function-plot/')) {
    return 'vendor-function-plot'
  }

  // Keep the tiny `?url` wasm-locator modules out of this chunk so it stays a
  // pure dynamic import, only fetched when a Typst formula is actually rendered.
  if (id.includes('/@myriaddreamin/') && !id.includes('.wasm')) {
    return 'vendor-typst'
  }

  if (id.includes('/d3')) {
    return 'vendor-d3'
  }

  return undefined
}

function resolveRendererModulePreloads(
  _filename: string,
  deps: string[],
  context: { hostType: 'html' | 'js' }
): string[] {
  if (context.hostType === 'html') {
    return deps.filter((dep) => dep.includes('vendor-react'))
  }
  return deps.filter((dep) => !isDeferredRendererPreload(dep))
}

function isDeferredRendererPreload(dep: string): boolean {
  return (
    dep.includes('NoteHoverPreview-') ||
    dep.includes('Preview-') ||
    dep.includes('wardley-') ||
    dep.includes('vendor-markdown') ||
    dep.includes('vendor-highlight') ||
    dep.includes('vendor-d3') ||
    dep.includes('vendor-mermaid') ||
    dep.includes('vendor-jsxgraph') ||
    dep.includes('vendor-function-plot') ||
    dep.includes('vendor-typst')
  )
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: MAIN_EXTERNALIZE_EXCLUSIONS })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: ['keytar'],
        // The MCP server and the `zen` CLI are independent Node entry
        // points bundled alongside the main process. electron-vite\u2019s
        // `main` section is the only slot whose output is plain ESM
        // that `node` can execute directly \u2014 which is what both
        // Claude Code / Claude Desktop / Codex (stdio MCP) and the
        // CLI wrapper script (build/zen) need.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          mcp: resolve(__dirname, 'src/mcp/index.ts'),
          cli: resolve(__dirname, 'src/cli/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared-domain/src'),
        '@bridge-contract': resolve(__dirname, '../../packages/bridge-contract/src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: INTERNAL_WORKSPACE_PACKAGES })],
    define: {
      __APP_COMMIT__: JSON.stringify(gitCommit())
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared-domain/src'),
        '@bridge-contract': resolve(__dirname, '../../packages/bridge-contract/src')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // Typst ships a WASM compiler loaded lazily via `?url` + dynamic import; keep
    // it out of the esbuild dep pre-bundler so the wasm glue stays intact.
    optimizeDeps: {
      exclude: [
        '@myriaddreamin/typst.ts',
        '@myriaddreamin/typst-ts-web-compiler',
        '@myriaddreamin/typst-ts-renderer'
      ]
    },
    build: {
      outDir: 'out/renderer',
      minify: 'esbuild',
      // This is a desktop app with multiple on-demand diagram stacks.
      // Some lazy chunks are intentionally larger than the web default.
      chunkSizeWarningLimit: 3500,
      modulePreload: {
        resolveDependencies: resolveRendererModulePreloads
      },
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          manualChunks: rendererManualChunk
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, '../../packages/app-core/src'),
        '@shared': resolve(__dirname, '../../packages/shared-domain/src'),
        '@bridge-contract': resolve(__dirname, '../../packages/bridge-contract/src')
      }
    },
    plugins: [react()]
  }
})
