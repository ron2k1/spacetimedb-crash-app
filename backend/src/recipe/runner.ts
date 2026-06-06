export interface Beat { id: string; label: string; effect?: 'search' | 'write' }

/** The filmed hero flow as fixed beats. Each beat emits regardless of effect outcome. */
export const HERO_RECIPE: Beat[] = [
  { id: 'browse', label: 'Browse the marketplace' },
  { id: 'buy', label: 'Buy Deep Research Pro with USDC' },
  { id: 'search', label: 'Run the Tavily-backed search', effect: 'search' },
  { id: 'save', label: 'Save the result to a granted folder', effect: 'write' },
  { id: 'byok', label: 'Paste a media key; the matching agent lights up' },
  { id: 'create', label: 'Build and publish a new agent' },
];

/** Run a recipe to completion. Effects may throw; the beat still advances (flop-proof). */
export async function runRecipe(
  recipe: Beat[],
  args: { emit: (beatId: string) => void; effects: { search: () => Promise<unknown>; write: () => Promise<unknown> } },
): Promise<void> {
  for (const beat of recipe) {
    try {
      if (beat.effect) await args.effects[beat.effect]();
    } catch {
      // Swallow: the recipe never flops on stage. Real errors are surfaced as synthetic codes elsewhere.
    }
    args.emit(beat.id);
  }
}
