import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Persisted set of user-granted writable folders. NOT secret (paths only). */
export class GrantStore {
  private folders: Set<string>;

  constructor(private readonly file: string) {
    this.folders = new Set(this.load());
  }

  private load(): string[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed?.folders) ? parsed.folders : [];
    } catch {
      return [];
    }
  }

  add(folder: string): void {
    this.folders.add(folder);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ folders: [...this.folders] }, null, 2));
  }

  list(): string[] {
    return [...this.folders];
  }
}
