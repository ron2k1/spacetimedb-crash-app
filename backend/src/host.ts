#!/usr/bin/env node
// Headless engine host. Runs with NO renderer attached (Spec 3.2 "headless-first").
// Prints one machine-readable boot line the launcher/renderer reads to connect.
import { resolveProvider } from './agent/detect.js';
import { startEngineServer } from './socket/server.js';
import { resolveWorkspace } from './workspace/paths.js';
import { ENGINE_VERSION } from './index.js';
import { PROTOCOL_VERSION, type Provider as ProviderId } from '@crash/protocol';

async function main(): Promise<void> {
  const envProvider = process.env.CRASH_PROVIDER;
  const forceOffline = envProvider === 'offline';
  const prefer = (forceOffline ? undefined : envProvider) as ProviderId | undefined;
  const provider = await resolveProvider({ prefer, allowOffline: true, forceOffline });
  const port = process.env.CRASH_PORT ? Number(process.env.CRASH_PORT) : 0;
  const workspace = resolveWorkspace(process.env.CRASH_WORKSPACE);

  const server = await startEngineServer({ provider, port, engineVersion: ENGINE_VERSION, workspace });
  console.log(
    JSON.stringify({
      event: 'engine.ready',
      host: server.host,
      port: server.port,
      token: server.token,
      protocolVersion: PROTOCOL_VERSION,
      provider: provider.id,
      workspace: workspace.root,
    }),
  );

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'engine.error', code: 'boot_failure' }));
  process.exit(1);
});
