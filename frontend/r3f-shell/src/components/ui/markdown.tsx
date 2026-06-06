// Markdown -- the shared renderer for everything "Crash says": the speech bubble (CrashSpeech) and the
// run answer (ActivityPanel.AnswerCard). The headless local model returns Markdown (code fences, lists,
// bold, tables via GFM), so rendering it as a structured React tree is what turns a function snippet
// from a wall of literal backticks into a real, readable code block.
//
// SAFETY: react-markdown parses Markdown into React elements -- it never sets innerHTML and never runs
// embedded scripts. `skipHtml` additionally drops any raw <html> the model might emit. Anchor hrefs are
// intentionally NOT rendered as navigable links: in a Tauri webview a stray link could navigate the app
// frame, so we keep link text styled-but-inert. This keeps the renderer CSP-safe with no remote fetches.
//
// `compact` tightens the spacing + caps code-block height for the small speech bubble; the default
// (false) is the roomier layout used inside the Activity answer card. The component sets no fontSize or
// color of its own -- it inherits the caller's typography so the same answer reads at the bubble's 14.5px
// or the answer card's 13.5px without duplicating the scale here.
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { theme, FONT } from '../../theme';

// A monospace stack that exists on Windows (Consolas) + macOS (Menlo/SFMono) -- code should read as code.
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

function buildComponents(compact: boolean): Components {
  return {
    // Paragraph: no margins in compact (the bubble owns its padding); roomy bottom margin in the answer.
    p: ({ children }) => (
      <p style={{ margin: compact ? '0' : '0 0 8px', lineHeight: compact ? 1.5 : 1.55 }}>{children}</p>
    ),
    // Fenced/indented code: <pre> is the dark, scrollable box; the inner <code> renders bare so the box
    // styling lives in one place. Height is capped (+ scroll) so a long snippet can't blow out the card.
    pre: ({ children }) => (
      <pre
        style={{
          margin: compact ? '6px 0' : '8px 0',
          padding: compact ? '8px 10px' : '10px 12px',
          background: 'rgba(0,0,0,0.34)',
          border: `1px solid ${theme.ui.line}`,
          borderRadius: 10,
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: compact ? 168 : 320,
          fontFamily: MONO,
          fontSize: compact ? 12 : 12.5,
          lineHeight: 1.5,
          color: theme.ui.ink,
        }}
      >
        {children}
      </pre>
    ),
    code: ({ className, children }) => {
      const text = String(children ?? '');
      // Block when it carries a `language-*` class (fenced) OR spans multiple lines (indented). Otherwise
      // it's inline `code` and gets a small chip; v10 dropped the old `inline` prop, so we infer it here.
      const isBlock = /language-/.test(className ?? '') || text.includes('\n');
      if (isBlock) {
        return <code style={{ fontFamily: MONO, background: 'transparent', padding: 0 }}>{children}</code>;
      }
      return (
        <code
          style={{
            fontFamily: MONO,
            fontSize: '0.92em',
            background: 'rgba(0,0,0,0.28)',
            border: `1px solid ${theme.ui.line}`,
            borderRadius: 6,
            padding: '1px 5px',
            color: theme.ui.ink,
          }}
        >
          {children}
        </code>
      );
    },
    strong: ({ children }) => <strong style={{ fontWeight: 800, color: theme.ui.ink }}>{children}</strong>,
    em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
    ul: ({ children }) => (
      <ul style={{ margin: compact ? '2px 0' : '4px 0 8px', paddingLeft: 18 }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ margin: compact ? '2px 0' : '4px 0 8px', paddingLeft: 18 }}>{children}</ol>
    ),
    li: ({ children }) => <li style={{ margin: '2px 0', lineHeight: 1.5 }}>{children}</li>,
    // Headings map to scaled divs -- a chat answer shouldn't inject document-level <h1> sizing/landmarks.
    h1: ({ children }) => (
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: compact ? 15 : 16, margin: '6px 0 4px', color: theme.ui.ink }}>{children}</div>
    ),
    h2: ({ children }) => (
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: compact ? 14.5 : 15, margin: '6px 0 4px', color: theme.ui.ink }}>{children}</div>
    ),
    h3: ({ children }) => (
      <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: compact ? 14 : 14.5, margin: '5px 0 3px', color: theme.ui.ink }}>{children}</div>
    ),
    // Links are rendered styled-but-inert (no href) so a click can't navigate the Tauri app frame.
    a: ({ children }) => (
      <span style={{ color: theme.ui.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>{children}</span>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          margin: compact ? '4px 0' : '6px 0 8px',
          paddingLeft: 10,
          borderLeft: `3px solid ${theme.ui.accent}`,
          color: theme.ui.inkSoft,
        }}
      >
        {children}
      </blockquote>
    ),
    hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${theme.ui.line}`, margin: '8px 0' }} />,
    // GFM tables: minimal bordered grid so a tabular answer stays legible without extra deps.
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', margin: '6px 0 8px' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: compact ? 12 : 12.5 }}>{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th style={{ border: `1px solid ${theme.ui.line}`, padding: '4px 8px', textAlign: 'left', fontWeight: 800, color: theme.ui.ink }}>{children}</th>
    ),
    td: ({ children }) => (
      <td style={{ border: `1px solid ${theme.ui.line}`, padding: '4px 8px', color: theme.ui.ink }}>{children}</td>
    ),
  };
}

const COMPACT_COMPONENTS = buildComponents(true);
const FULL_COMPONENTS = buildComponents(false);

export function Markdown({ children, compact = false }: { children: string; compact?: boolean }) {
  return (
    <div style={{ fontFamily: FONT.body, color: theme.ui.ink, wordBreak: 'break-word' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={compact ? COMPACT_COMPONENTS : FULL_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
