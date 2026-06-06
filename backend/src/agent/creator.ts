import type { Capability } from '../connectors/types.js';
import type { AgentManifest } from './agents.js';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent';
}

/**
 * Deterministic draft used offline (and as the architect's scaffold). Infers capabilities
 * and a write folder from goal keywords, and writes a strong default system prompt. The
 * Permissions step in the wizard is still mandatory -- this only PROPOSES.
 */
export function draftAgentOffline(goal: string, createdAt: string): AgentManifest {
  const g = goal.toLowerCase();
  const caps = new Set<Capability>();
  if (/search|research|web|paper|news|find out/.test(g)) caps.add('search');
  if (/image|picture|logo|art/.test(g)) caps.add('image.generate');
  if (/voice|speak|audio|narrat/.test(g)) caps.add('tts.speak');
  if (/video|clip|reel/.test(g)) caps.add('video.generate');
  const writeFolders: string[] = [];
  if (/save|write|file|document|note|export/.test(g)) {
    caps.add('fs');
    writeFolders.push('Crash Output');
  }
  if (caps.size === 0) caps.add('chat');

  const name = goal.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()).slice(0, 50);
  return {
    id: slugify(goal),
    name,
    goal: goal.trim(),
    systemPrompt:
      `You are an expert assistant whose single job is: ${goal.trim()}.\n` +
      `Work step by step. Use only the capabilities you were granted. When you need a tool, ` +
      `state which capability and why. Cite sources. Never ask for credentials.`,
    requires: { capabilities: [...caps] },
    permissions: { readBroad: false, writeFolders },
    source: 'user',
    createdAt,
  };
}
