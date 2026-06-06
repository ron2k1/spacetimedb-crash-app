import { describe, it, expect } from 'vitest';
import {
  ProtocolEventSchema,
  RequestSubmitSchema,
  ErrorSchema,
  ResultFinalSchema,
  makeMessage,
  PROTOCOL_VERSION,
} from '../src/events.js';

describe('envelope + discriminated union', () => {
  it('accepts a well-formed request.submit', () => {
    const msg = makeMessage('request.submit', 'sess_1', 1, {
      requestId: 'req_1',
      text: 'Summarize this',
    });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects an unknown event type', () => {
    const bad = { v: PROTOCOL_VERSION, type: 'totally.fake', sessionId: 's', seq: 0, payload: {} };
    expect(ProtocolEventSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a wrong protocol version', () => {
    const bad = makeMessage('run.cancel', 's', 0, { requestId: 'r' });
    const tampered = { ...bad, v: 999 };
    expect(ProtocolEventSchema.safeParse(tampered).success).toBe(false);
  });

  it('rejects a payload missing a required field', () => {
    const bad = { v: PROTOCOL_VERSION, type: 'request.submit', sessionId: 's', seq: 1, payload: {} };
    expect(RequestSubmitSchema.safeParse(bad).success).toBe(false);
  });

  it('allows optional fields to be omitted (result.final without citations)', () => {
    const msg = makeMessage('result.final', 's', 2, { requestId: 'r', answer: 'done' });
    expect(ResultFinalSchema.safeParse(msg).success).toBe(true);
  });

  it('error payload accepts code-only (no free-text leak surface)', () => {
    const msg = makeMessage('error', 's', 3, { code: 'index_unavailable', retryable: true });
    const parsed = ErrorSchema.safeParse(msg);
    expect(parsed.success).toBe(true);
    // Guard the security invariant: a stray `message` field must be stripped by zod,
    // never preserved on the parsed object.
    const withMessage = makeMessage('error', 's', 4, {
      code: 'x',
      retryable: false,
      message: 'secret stack trace',
    } as unknown as { code: string; retryable: boolean });
    const out = ErrorSchema.parse(withMessage);
    expect('message' in out.payload).toBe(false);
  });

  it('rejects step.progress fraction outside 0..1', () => {
    const bad = makeMessage('step.progress', 's', 5, { planId: 'p', stepId: 'st', fraction: 1.5 });
    expect(ProtocolEventSchema.safeParse(bad).success).toBe(false);
  });
});

describe('provider handshake field (display-only, Spec 3.1)', () => {
  const helloBase = { token: 'tok', protocolVersion: PROTOCOL_VERSION, renderer: 'unity' };

  it('accepts hello with a valid provider', () => {
    const msg = makeMessage('hello', '', 0, { ...helloBase, provider: 'claude-code' });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(true);
  });

  it('accepts session.ready with the codex provider', () => {
    const msg = makeMessage('session.ready', 's', 0, {
      sessionId: 's',
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: '0.1.0',
      provider: 'codex',
    });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects an unknown provider value', () => {
    const msg = makeMessage('hello', '', 0, { ...helloBase, provider: 'gemini' });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(false);
  });

  it('rejects hello missing the provider field', () => {
    const msg = makeMessage('hello', '', 0, { ...helloBase });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(false);
  });
});
