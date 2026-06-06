// crash/tests/sanity.test.ts
import { describe, it, expect } from 'vitest';
describe('sanity', () => {
  it('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
