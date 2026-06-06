// catalog.ts -- the seed content for the dashboard panels. Crash is an agentic marketplace, so the
// Skills and Plugins here are framed as clear, concrete capabilities you can turn on and run, NOT a
// developer tool's feature flags. This is the data that makes the right-side dashboard ALIVE on first
// paint (before any engine connects). Once a live engine is attached, real events (marketplace.installed,
// skill.saved) layer on top of these in the dashboardStore -- these are the starting world, not a
// mock of the engine.

export interface SkillItem {
  id: string;
  icon: string; // a single emoji -- reads at a glance
  name: string;
  blurb: string; // one clear, plain-language sentence
  tags: string[];
  enabled: boolean;
  level: 'starter' | 'core' | 'pro'; // a gentle progression cue
}

export interface PluginItem {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  provider: string; // shown small + muted; where the super-power comes from
  connected: boolean;
}

export interface SubagentItem {
  id: string;
  icon: string;
  name: string;
  role: string;
  instructions: string;
  enabled: boolean;
  custom?: boolean;
  // When this agent was created by promoting a skill ("Make Agent" on a skill card), the source
  // skill id. One skill -> one agent: used to prevent duplicate promotions of the same skill.
  fromSkill?: string;
}

// Skill-creator pipeline stages -- shown as a clear 4-step "recipe" in the Skill Creator panel
// so you can see how a new skill gets made (describe -> name -> try -> save).
export interface CreatorStage {
  id: string;
  icon: string;
  title: string;
  hint: string;
}

export const SKILLS: SkillItem[] = [
  {
    id: 'eli10',
    icon: '💬',
    name: 'Explain Clearly',
    blurb: 'Crash explains things in clear, plain language -- no jargon.',
    tags: ['Reading', 'Everyday'],
    enabled: true,
    level: 'starter',
  },
  {
    id: 'show-work',
    icon: '🔍',
    name: 'Show Your Work',
    blurb: 'Watch Crash think out loud, one step at a time.',
    tags: ['Thinking', 'Trust'],
    enabled: true,
    level: 'starter',
  },
  {
    id: 'fact-check',
    icon: '✅',
    name: 'Fact Check',
    blurb: 'Crash double-checks claims against your own notes before saying them.',
    tags: ['Trust', 'Research'],
    enabled: true,
    level: 'core',
  },
  {
    id: 'summarize',
    icon: '📝',
    name: 'Shrink It Down',
    blurb: 'Condense a long wall of text down to the few parts that matter.',
    tags: ['Reading', 'Docs'],
    enabled: false,
    level: 'core',
  },
  {
    id: 'draw-diagram',
    icon: '🎨',
    name: 'Draw the Idea',
    blurb: 'Turn a tricky idea into a clear picture or diagram you can see.',
    tags: ['Pictures', 'Docs'],
    enabled: false,
    level: 'pro',
  },
  {
    id: 'quiz-me',
    icon: '❓',
    name: 'Q&A Over Your Docs',
    blurb: 'Ask a question and Crash answers from your own files, citing where it found it.',
    tags: ['Docs', 'Research'],
    enabled: false,
    level: 'pro',
  },
];

export const PLUGINS: PluginItem[] = [
  {
    id: 'my-notes',
    icon: '📓',
    name: 'My Notes',
    blurb: 'Let Crash read your saved notes so its answers fit what YOU are working on.',
    provider: 'On this computer',
    connected: true,
  },
  {
    id: 'web-search',
    icon: '🌐',
    name: 'Look It Up',
    blurb: 'Crash can search the web for fresh facts when your notes do not have them.',
    provider: 'Web',
    connected: true,
  },
  {
    id: 'calculator',
    icon: '🧮',
    name: 'Math Helper',
    blurb: 'For numbers, Crash uses a real calculator so the math is always exact.',
    provider: 'Built in',
    connected: true,
  },
  {
    id: 'memory',
    icon: '🧠',
    name: 'Remember Me',
    blurb: 'Crash remembers your preferences so it gets to know you over time.',
    provider: 'On this computer',
    connected: false,
  },
];

export const SUBAGENTS: SubagentItem[] = [
  {
    id: 'research-scout',
    icon: '🔎',
    name: 'Research Scout',
    role: 'Finds relevant notes and sources',
    instructions: 'Look through the available context, identify the useful pieces, and return a concise source-backed answer.',
    enabled: true,
  },
  {
    id: 'skill-builder',
    icon: '🧰',
    name: 'Skill Builder',
    role: 'Turns repeated workflows into skills',
    instructions: 'Convert a repeatable request into a named skill with clear inputs, steps, and a saved output shape.',
    enabled: true,
  },
];

export const CREATOR_STAGES: CreatorStage[] = [
  { id: 'teach', icon: '🗣️', title: 'Describe it', hint: 'Tell Crash what you want your agent to do.' },
  { id: 'name', icon: '🏷️', title: 'Give it a name', hint: 'Pick a name so you can reuse it later.' },
  { id: 'try', icon: '🎏', title: 'Try it out', hint: 'Take your new skill for a quick test run.' },
  { id: 'save', icon: '⭐', title: 'Save it', hint: 'Keep it in your skill shelf for next time.' },
];
