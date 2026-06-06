import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const localAppData = process.env.LOCALAPPDATA;

// Dev-only: surface the engine's connection descriptor to the webview as
// window.__CRASH_BOOT__. The headless engine writes <workspace>/.runtime/socket.json
// { host, port, token, protocolVersion, provider }; we read it at serve time and inject
// it into index.html so the renderer's boot resolver (src/net/boot.ts) can pick it up.
//
// SECURITY: apply:"serve" means this NEVER runs during `vite build` -- the per-session
// localhost token must never be baked into a production bundle. We also forward ONLY the
// five connection fields, not the whole descriptor file.
function crashBootInject(): Plugin {
  return {
    name: "crash-boot-inject",
    apply: "serve",
    transformIndexHtml() {
      const workspace = process.env.CRASH_WORKSPACE ?? join(homedir(), "Crash");
      const socketPath = join(workspace, ".runtime", "socket.json");
      let descriptor: Record<string, unknown>;
      try {
        descriptor = JSON.parse(readFileSync(socketPath, "utf8"));
      } catch {
        // Engine not running yet -> inject nothing; the app shows "waiting for engine".
        return [];
      }
      const boot = {
        host: descriptor.host,
        port: descriptor.port,
        token: descriptor.token,
        protocolVersion: descriptor.protocolVersion,
        provider: descriptor.provider,
      };
      return [
        {
          tag: "script",
          injectTo: "head-prepend",
          children: `window.__CRASH_BOOT__ = ${JSON.stringify(boot)};`,
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), crashBootInject()],

  // Force a SINGLE instance of react-three-fiber + three across the app AND Vite's pre-bundled
  // deps. Without this, Vite pre-bundles @react-three/postprocessing with its OWN copy of fiber,
  // so postprocessing's internal useThree() reads a different React context than the one <Canvas>
  // populated -> "R3F: Hooks can only be used within the Canvas component!" and the whole 3D scene
  // crashes to a blank screen. Deduping collapses them to one instance the entire graph shares.
  resolve: {
    // @/* -> src/* (shadcn import convention; mirrors the tsconfig "paths" entry). Using
    // fileURLToPath(new URL(...)) is the correct cross-platform URL->path conversion -- the
    // ".pathname.slice(1)" shortcut yields a broken "/C:/..." path off Windows.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["@react-three/fiber", "three"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 0. On Windows, move Vite's cacheDir out of node_modules. Default is
  //    `node_modules/.vite/`, which hits a Defender RTP race on `deps_temp_*`
  //    mkdir/write during optimizeDeps. %LOCALAPPDATA% is the canonical
  //    Windows build-cache scope and is treated as runtime cache by Defender.
  //    Non-Windows OSes leave cacheDir undefined -> Vite's default applies
  //    (the Defender race is Windows-specific).
  cacheDir: localAppData ? `${localAppData}/crash-vite-cache` : undefined,
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
