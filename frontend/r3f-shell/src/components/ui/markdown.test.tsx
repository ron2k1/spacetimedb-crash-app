// crash/src/components/ui/markdown.test.tsx
//
// Markdown is the single path everything "Crash says" flows through -- the speech bubble (CrashSpeech) and
// the run answer card (ActivityPanel.AnswerCard). These tests pin the exact behaviors that motivated the
// switch away from the character-by-character Typewriter: a fenced code block must become a real
// <pre><code> box (NOT a wall of literal backticks a char-stream would emit), inline `code` must stay an
// inline chip, and the GFM features we turned on (bold, lists, tables) must render as real elements.
//
// We assert against renderToStaticMarkup output (a pure HTML string) rather than mounting + querying the
// DOM: the component renders no state or effects, so static markup is the simplest faithful check and
// avoids any DOM-testing-library / React-version coupling.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './markdown';

const html = (md: string) => renderToStaticMarkup(<Markdown>{md}</Markdown>);

describe('Markdown', () => {
  it('renders a fenced code block as a <pre> with the code text inside', () => {
    const out = html('```js\nconst x = 1;\n```');
    expect(out).toContain('<pre');
    expect(out).toContain('const x = 1;');
  });

  it('keeps inline code as a <code> chip with no <pre> box', () => {
    const out = html('Call the `greet` function.');
    expect(out).not.toContain('<pre');
    expect(out).toContain('<code');
    expect(out).toContain('greet');
  });

  it('renders **bold** as <strong>', () => {
    const out = html('This is **important**.');
    expect(out).toContain('<strong');
    expect(out).toContain('important');
  });

  it('renders a bullet list as three <li> items', () => {
    const out = html('- one\n- two\n- three');
    expect(out.match(/<li/g)?.length).toBe(3);
  });

  it('renders a GFM table as a <table> (proves remark-gfm is enabled)', () => {
    const out = html('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(out).toContain('<table');
    expect(out).toContain('<th');
    expect(out).toContain('<td');
  });

  it('drops raw HTML (skipHtml) instead of passing through a <script> tag', () => {
    const out = html('Hello <script>alert(1)</script> world');
    expect(out).not.toContain('<script');
  });
});
