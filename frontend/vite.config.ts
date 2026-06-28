// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

type LovableConfig = Parameters<typeof defineConfig>[0];
type NodeServerConfig = LovableConfig & { nitro: { preset: "node-server" } };

const config: NodeServerConfig = {
  // Force Nitro to emit a standalone Node server for self-hosted Docker deploys.
  // Without this, lovable defaults to `cloudflare-module` and `bun run build`
  // only writes `dist/{client,server}` — no runnable server entry.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
};

export default defineConfig(config);
