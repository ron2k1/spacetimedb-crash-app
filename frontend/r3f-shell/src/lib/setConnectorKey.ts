import { invoke } from '@tauri-apps/api/core';

/**
 * Send a connector key to the engine via native IPC. The key NEVER touches the
 * WebSocket or any store. Callers MUST clear the input field immediately after this resolves.
 */
export async function setConnectorKey(connectorId: string, key: string): Promise<void> {
  await invoke('set_connector_key', { connectorId, key });
}
