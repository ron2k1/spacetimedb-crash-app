import { describe, it, expect } from 'vitest';
import { runRecipe, HERO_RECIPE } from '../../src/recipe/runner.js';

describe('runRecipe (flop-proof)', () => {
  it('emits every beat in order even when all effects throw', async () => {
    const seen: string[] = [];
    await runRecipe(HERO_RECIPE, {
      emit: (beatId) => seen.push(beatId),
      effects: { search: async () => { throw new Error('net'); }, write: async () => { throw new Error('disk'); } },
    });
    expect(seen).toEqual(HERO_RECIPE.map((b) => b.id));
  });
});
