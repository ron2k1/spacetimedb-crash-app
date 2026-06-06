import { describe, it, expect } from 'vitest';
import { loginCommandFor } from '../src/agent/auth.js';

// Pins the PURE closed-enum mapping that builds the interactive login command. This is the
// unit-testable core of the security rail "the login command contains NO user input" — the
// only two strings we will ever hand to the spawned terminal. Verbs confirmed on-machine:
//   `claude auth` exposes login/logout/status; `codex login` exposes a status subcommand.
// detectAuth / startProviderLogin are intentionally NOT tested here: they spawn real
// processes (and, on win32, a visible terminal), which a unit test must never do.
describe('loginCommandFor (closed-enum login command mapping)', () => {
  it('maps codex to its interactive sign-in command', () => {
    expect(loginCommandFor('codex')).toBe('codex login');
  });

  it('maps claude-code to its interactive sign-in command', () => {
    expect(loginCommandFor('claude-code')).toBe('claude auth login');
  });
});
