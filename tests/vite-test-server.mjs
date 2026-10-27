import { createServer as createViteServer } from "vite";

// SSR tests import dependencies through Node. Scanning and bundling the entire
// browser app here wastes disk and races concurrent tests for the dev cache.
export function createServer(config = {}) {
  return createViteServer({
    ...config,
    server: { ...config.server, middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { ...config.optimizeDeps, noDiscovery: true, include: [] },
    plugins: [...(config.plugins ?? []), {
      name: "wattstatus-ssr-tests-without-client-optimizer",
      configResolved(resolved) {
        // React's config hook may append jsx-runtime to optimizeDeps.include.
        // Clear it after config resolution: these tests never serve a client.
        resolved.optimizeDeps.noDiscovery = true;
        resolved.optimizeDeps.include = [];
      },
    }],
  });
}
