import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { retrieve, fileCount } from '../src/rag/retriever.js';

describe('local retriever', () => {
  it('ranks the matching passage first and cites the file by basename', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-docs-'));
    fs.writeFileSync(path.join(dir, 'a.md'), 'Apples are red.\n\nCedar is the coldest town in the valley.');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'Unrelated grocery list: bananas, milk.');

    expect(fileCount(dir)).toBe(2);
    const hits = retrieve(dir, 'which town is coldest', { topK: 1 });
    expect(hits.length).toBe(1);
    expect(hits[0].source).toBe('a.md');
    expect(hits[0].text.toLowerCase()).toContain('coldest');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('grounds a holistic "summarize" ask on file content even with zero keyword overlap', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-docs-'));
    fs.writeFileSync(
      path.join(dir, 'week.md'),
      'Tuesday the plumber fixed the kitchen sink for forty dollars.\n\nFriday the doctor moved the appointment to Monday.',
    );

    // "summarize my notes" shares no words with the content, so the keyword path returns
    // nothing. The holistic fallback must still hand back real passages to summarize on —
    // otherwise the flagship demo says "I found nothing" while staring at a full folder.
    const hits = retrieve(dir, 'summarize my notes', { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source).toBe('week.md');
    expect(hits.map((h) => h.text).join(' ').toLowerCase()).toContain('plumber');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a single FILE target -- exactly that file, by basename, ignoring siblings', () => {
    // This is the file the user pointed Crash at (protocol targetPath). Retrieval must read
    // ONLY this file -- not the unrelated sibling sitting next to it in the same folder.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-docs-'));
    const picked = path.join(dir, 'contract.md');
    fs.writeFileSync(picked, 'The lease ends on March 3rd.\n\nRent is due on the first.');
    fs.writeFileSync(path.join(dir, 'ignore.md'), 'Totally unrelated notes about penguins and lease-free igloos.');

    expect(fileCount(picked)).toBe(1); // the FILE, not the 2-file folder
    const hits = retrieve(picked, 'when does the lease end', { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === 'contract.md')).toBe(true); // sibling never read
    expect(hits[0].text.toLowerCase()).toContain('lease');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns nothing for a missing path instead of throwing', () => {
    expect(fileCount(path.join(os.tmpdir(), 'crash-does-not-exist-xyz'))).toBe(0);
    expect(retrieve(path.join(os.tmpdir(), 'crash-does-not-exist-xyz'), 'anything')).toEqual([]);
  });
});
