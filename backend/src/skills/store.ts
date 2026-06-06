// "The shelf IS the state" (Spec 7.2). A saved skill is a real, human-readable folder
// in Crash/skills/<slug>/ with a SKILL.md (Claude Code skill format) plus a skill.json
// sidecar that records the goal so the skill is RE-RUNNABLE: re-running a shelf card
// just feeds the stored goal back through the orchestrator. Progress is a filesystem
// read, not a database.
import fs from 'node:fs';
import path from 'node:path';
import type { Provider as ProviderId } from '@crash/protocol';
import { slugify } from './slug.js';
import { assertInsideWorkspace, type Workspace } from '../workspace/paths.js';
import type { ActivityEmitter } from '../workspace/activity.js';

export interface SavedSkill {
  skillId: string;
  name: string;
  slug: string;
  description: string;
  goal: string;
  provider: ProviderId;
  createdAt: string;
  /** Workspace-relative path to the SKILL.md, e.g. 'skills/summarize-this/SKILL.md'. */
  path: string;
}

export interface SaveSkillInput {
  name: string;
  description: string;
  goal: string;
  provider: ProviderId;
}

function skillMd(input: SaveSkillInput): string {
  return [
    '---',
    `name: ${input.name}`,
    `description: ${input.description}`,
    '---',
    '',
    `# ${input.name}`,
    '',
    input.description,
    '',
    '## What this skill does',
    '',
    `When you run this, Crash will: ${input.goal}`,
    '',
    'It reads only the files in your Crash docs folder and answers in plain language.',
    '',
  ].join('\n');
}

export function saveSkill(
  ws: Workspace,
  input: SaveSkillInput,
  activity?: ActivityEmitter,
): SavedSkill {
  const slug = slugify(input.name);
  const dirAbs = assertInsideWorkspace(ws, path.join('skills', slug));
  fs.mkdirSync(dirAbs, { recursive: true });
  activity?.emit('mkdir', dirAbs);

  const createdAt = new Date().toISOString();
  const skillId = `sk_${slug}_${Date.now()}`;
  const relPath = path.posix.join('skills', slug, 'SKILL.md');

  // Compute each file's content into a const FIRST so the byte length is exact.
  const skillMdContent = skillMd(input);
  const skillMdAbs = path.join(dirAbs, 'SKILL.md');
  fs.writeFileSync(skillMdAbs, skillMdContent);
  activity?.emit('create', skillMdAbs, Buffer.byteLength(skillMdContent));

  const meta: SavedSkill = {
    skillId,
    name: input.name,
    slug,
    description: input.description,
    goal: input.goal,
    provider: input.provider,
    createdAt,
    path: relPath,
  };
  const metaContent = JSON.stringify(meta, null, 2);
  const metaAbs = path.join(dirAbs, 'skill.json');
  fs.writeFileSync(metaAbs, metaContent);
  activity?.emit('create', metaAbs, Buffer.byteLength(metaContent));
  return meta;
}

export function listSkills(ws: Workspace): SavedSkill[] {
  let dirs: fs.Dirent[] = [];
  try {
    dirs = fs.readdirSync(ws.skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SavedSkill[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const metaPath = path.join(ws.skillsDir, d.name, 'skill.json');
    try {
      out.push(JSON.parse(fs.readFileSync(metaPath, 'utf8')) as SavedSkill);
    } catch {
      // a lesson folder without skill.json is fine — skip it on the shelf reader
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Re-run support: fetch the stored goal for a saved skill (by slug). */
export function getSkillGoal(ws: Workspace, slug: string): string | null {
  try {
    const meta = JSON.parse(
      fs.readFileSync(path.join(ws.skillsDir, slug, 'skill.json'), 'utf8'),
    ) as SavedSkill;
    return meta.goal;
  } catch {
    return null;
  }
}
