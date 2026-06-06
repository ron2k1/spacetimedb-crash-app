// Intent routing -- the small brain that keeps "hello" from becoming a skill.
//
// Before this, every input flowed into the creation loop (plan -> RAG -> answer ->
// skill.save.offer), so a plain greeting got offered up as a saveable skill. That is
// wrong: a conversational turn ("hi", "thanks", "what can you do?") should get a warm,
// instant reply and STOP -- no plan, no file read, no save card. A real task ("summarize
// this", "find the dates in my contract") keeps the full loop.
//
// The classifier is deterministic and offline on purpose: a greeting must answer instantly
// and work with no provider running. It is intentionally conservative -- it only calls
// something "chat" when the WHOLE utterance is conversational (anchored ^...$). Anything
// with real content past a greeting ("hello, can you summarize my notes") falls through to
// 'task', because the anchored patterns won't match the longer string. The orchestrator
// additionally forces 'task' whenever the user pointed at a file/folder, since attaching
// something is itself a request to act on it.

export type Intent = 'chat' | 'task';

/** Lowercase, collapse runs of whitespace, and drop trailing sentence punctuation so
 *  "Hello!!!" and "hello" classify the same. Leaves internal punctuation alone. */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!?.,;:~]+$/g, '')
    .trim();
}

// Each pattern is anchored to the entire normalized utterance. An optional trailing
// "crash"/"there"/etc. is allowed so "hey crash" and "thanks so much" still count, but a
// real request riding after a greeting will be too long to match and becomes a task.
const GREETING =
  /^(hi+|hey+|hello+|heya|hiya|yo+|sup|wassup|what'?s up|howdy|hola|greetings|good (morning|afternoon|evening|day))( crash| there| buddy| friend| everyone| all| again)?$/;
const THANKS =
  /^(thanks|thank you|thx|ty|tysm|thank you so much|thanks so much|much appreciated|appreciate it|appreciated)( crash| so much)?$/;
const FAREWELL =
  /^(bye+|goodbye|see ya|see you|cya|later|laters|good ?night|gn|that'?s all|thats all|never ?mind|no thanks|i'?m good|im good|all done)( crash)?$/;
const AFFIRM =
  /^(ok|okay|k|kk|cool|nice|great|awesome|sweet|got it|gotcha|sounds good|yes|yeah|yep|yup|no|nope|nah|sure|fine|alright|lol|lmao|haha+|hmm+|hm|huh|oh|wow|nvm|test|testing|just testing|ping|hello world)$/;
const IDENTITY =
  /^(who are you|who'?re you|what are you|what'?re you|what'?s your name|whats your name|who is crash|who'?s crash|what is crash|what'?s crash|tell me about yourself|are you (a |an )?(ai|bot|robot|human|real|person)|are you there)( crash)?$/;
const CAPABILITY =
  /^(what can you do|what can you help( me)?( with)?|what do you do|what do you help with|how do you work|how does (this|it) work|how do i (use|start with) (this|you|it)|what is this|what'?s this|what now|what next|what should i (do|ask)|what do i do|help|help me|can you help( me)?|what are you for|how can you help( me)?|what can i (do|ask)( here)?)$/;

const CHAT_PATTERNS = [GREETING, THANKS, FAREWELL, AFFIRM, IDENTITY, CAPABILITY];

/** 'chat' for a purely conversational utterance; 'task' for anything that asks Crash to do
 *  real work. Defaults to 'task' so an unrecognized request is never silently swallowed. */
export function classifyIntent(text: string): Intent {
  const n = normalize(text);
  if (n.length === 0) return 'chat'; // an empty submit is not a task to plan
  return CHAT_PATTERNS.some((re) => re.test(n)) ? 'chat' : 'task';
}

// Warm, plain-language replies. Adult tone -- never condescending, no "explain like you're
// ten." Every reply steers toward a concrete next task and names the "Add a file" affordance
// so the user learns the one capability that unlocks the rest. ASCII only (this text crosses
// the wire as JSON and is rendered as markdown by the AnswerCard).
const REPLY = {
  greeting:
    "Hey! I'm Crash. Tell me something you'd like to do and I'll walk you through it, " +
    'showing you the plan before anything runs.\n\n' +
    'For example:\n' +
    '- Summarize a document\n' +
    '- Find the key points in your notes\n' +
    '- Explain what a file is about\n\n' +
    'You can point me at a file or folder with "Add a file," or just type your question.',
  thanks:
    "You're welcome! If there's anything else you'd like to do -- summarizing a file, " +
    'pulling out key details, or answering a question about your documents -- just say the word.',
  farewell:
    "Anytime. I'll be right here when you need me. Just tell me a task and we'll pick up from there.",
  identity:
    "I'm Crash, your guide for getting things done with AI. You tell me what you want in plain " +
    'words, I explain the plan, and I can turn it into a one-click skill you keep.\n\n' +
    'What would you like to try first? You could summarize a document, find key details in your ' +
    'notes, or explain a file in plain English.',
  capability:
    "I'm Crash, and I help you get real things done with AI one step at a time.\n\n" +
    "Tell me a task in plain words and I'll show you the plan before anything runs. For example:\n" +
    '- "Summarize this report"\n' +
    '- "Pull the important dates out of this contract"\n' +
    '- "Explain what this file is about"\n\n' +
    'Use "Add a file" to point me at something on your computer, or just ask a question. ' +
    'What would you like to do?',
} as const;

/** The reply for a chat turn. Picks the most specific category; greeting is the catch-all
 *  (it also covers affirmations like "ok"/"cool" and anything else conversational). */
export function chatReply(text: string): string {
  const n = normalize(text);
  if (THANKS.test(n)) return REPLY.thanks;
  if (FAREWELL.test(n)) return REPLY.farewell;
  if (IDENTITY.test(n)) return REPLY.identity;
  if (CAPABILITY.test(n)) return REPLY.capability;
  return REPLY.greeting;
}
