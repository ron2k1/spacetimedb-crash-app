import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startEngineServer } from '../src/socket/server.js';
import { DeterministicProvider } from '../src/agent/deterministic.js';
import { EngineToRendererSchema, PROTOCOL_VERSION } from '@crash/protocol';

const PV = PROTOCOL_VERSION;

async function open(url: string) {
  const ws = new WebSocket(url);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return ws;
}

describe('engine socket transport', () => {
  it('rejects a wrong token and runs the full loop on the right one', async () => {
    const srv = await startEngineServer({
      provider: new DeterministicProvider('claude-code'),
      port: 0,
      token: 'secret',
      engineVersion: '0.1.0',
    });
    const url = `ws://${srv.host}:${srv.port}`;

    // A folder the "user pointed at" so this drives the full FILE-task loop (plan -> confirm ->
    // RAG -> answer -> skill-save) over the socket. Under Full CLI chat (#13) a no-targetPath
    // message streams a direct answer with no plan/skill-save, so the full-loop transport test
    // attaches a target. The engine runs in-process here, so this temp dir is readable by it.
    const docDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-sock-'));
    fs.writeFileSync(
      path.join(docDir, 'notes.md'),
      'Cedar sits highest up the valley and is the coldest of the three towns.',
    );

    // wrong token -> closed
    const ws1 = await open(url);
    const closed = new Promise<number>((res) => ws1.once('close', (c) => res(c)));
    ws1.send(JSON.stringify({ v: PV, type: 'hello', sessionId: '', seq: 0, payload: { token: 'WRONG', protocolVersion: PV, renderer: 'r3f', provider: 'claude-code' } }));
    expect(await closed).toBe(1008);

    // right token -> full loop, all frames valid
    const events: string[] = [];
    const ws2 = await open(url);
    await new Promise<void>((resolve, reject) => {
      const requestId = 'req_x';
      ws2.send(JSON.stringify({ v: PV, type: 'hello', sessionId: '', seq: 0, payload: { token: 'secret', protocolVersion: PV, renderer: 'r3f', provider: 'claude-code' } }));
      ws2.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        expect(EngineToRendererSchema.safeParse(msg).success).toBe(true);
        events.push(msg.type);
        if (msg.type === 'session.ready') ws2.send(JSON.stringify({ v: PV, type: 'request.submit', sessionId: msg.sessionId, seq: 1, payload: { requestId, text: 'summarize my files', targetPath: docDir } }));
        else if (msg.type === 'plan.proposed') ws2.send(JSON.stringify({ v: PV, type: 'plan.confirm', sessionId: msg.sessionId, seq: 2, payload: { planId: msg.payload.planId } }));
        else if (msg.type === 'skill.save.offer') ws2.send(JSON.stringify({ v: PV, type: 'skill.save.accept', sessionId: msg.sessionId, seq: 3, payload: { requestId, name: 'Summarize This' } }));
        else if (msg.type === 'skill.saved') { ws2.close(); resolve(); }
        else if (msg.type === 'error') reject(new Error('engine error'));
      });
      setTimeout(() => reject(new Error('timeout: ' + events.join(','))), 8000);
    });

    for (const need of ['session.ready', 'plan.proposed', 'index.progress', 'answer.partial', 'result.final', 'skill.save.offer', 'skill.saved'])
      expect(events).toContain(need);

    await srv.close();
    fs.rmSync(docDir, { recursive: true, force: true });
  });
});
