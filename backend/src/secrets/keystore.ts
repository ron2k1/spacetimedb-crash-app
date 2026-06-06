import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Engine-only secret store. Maps connectorId -> apiKey (the x402 wallet private key
 * lives here too, under the reserved id 'x402.wallet'). File mode 0o600.
 *
 * SECURITY: values from this store NEVER cross the WebSocket, are NEVER logged, and
 * NEVER enter a renderer store. Only booleans (keyedIds) are ever surfaced.
 */
export class Keystore {
  private cache: Record<string, string>;

  constructor(private readonly file: string) {
    this.cache = this.load();
  }

  private load(): Record<string, string> {
    if (!existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    } catch {
      // Never log the contents on parse failure -- start empty.
      return {};
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file, JSON.stringify(this.cache), { mode: 0o600 });
  }

  get(connectorId: string): string | undefined {
    return this.cache[connectorId];
  }

  set(connectorId: string, key: string): void {
    this.cache[connectorId] = key;
    this.persist();
  }

  /** The set of connector ids that have a key -- the ONLY thing safe to surface. */
  keyedIds(): ReadonlySet<string> {
    return new Set(Object.keys(this.cache));
  }
}
