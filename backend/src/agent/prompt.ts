// The single prompt template shared by every real provider. FULL-CLI-CHAT posture: the headless
// agent is the user's real Claude Code, reachable in plain language. It answers directly from
// knowledge when it can, and USES its tools (web search, file reads, the rest) when the question
// needs live or external information -- current events, prices, latest news, docs -- or when the
// user asks it to look something up or act. The old "do NOT browse / do NOT run any tool" clamp
// (which existed only to stop turn-2 hangs) is gone: that protection now lives in the idle-output
// watchdog in proc.ts, which reaps a genuinely wedged child without muzzling a healthy one.
//
// Slash commands pass through VERBATIM. A user who types "/research ..." wants the CLI command to
// run, so we hand it to `claude -p` unwrapped; wrapping it in the conversational template would
// make the CLI treat "/research" as plain prose instead of a command.
export function buildPrompt(goal: string, context: string): string {
  const g = goal.trim();
  const ctx = context.trim();

  if (g.startsWith('/')) {
    return ctx ? `${g}\n\nCONTEXT:\n${ctx}` : g;
  }

  const lines = [
    'You are Crash, a warm, concise assistant for a non-technical person.',
    'Answer the message below directly and in plain language.',
    'When the answer needs live or external information (current events, prices, latest news,',
    'documentation) or the user asks you to look something up, research, or act, USE your tools',
    '-- web search, file reads, and the rest -- and then answer. When you already know the answer,',
    'just reply. Keep it clear and concise; explain what you did only if it helps.',
  ];
  if (ctx) lines.push('', 'OPTIONAL CONTEXT THEY SHARED:', ctx);
  lines.push('', 'THEIR MESSAGE:', g);
  return lines.join('\n');
}
