// dashboardStore.ts -- UI state for the right-side dashboard chrome: which section is showing, and
// the live (toggleable) catalog of skills + plugins. Seeded from data/catalog.ts so the panels are
// populated on first paint with NO engine attached. This is deliberately SEPARATE from taskStore:
// taskStore is the engine-driven run state (read-only mirror of the event stream), while this is
// pure local UI/catalog state the user pokes at directly. Keeping them apart means a toggle here
// can never accidentally look like an engine event, and vice-versa.
//
// The ONE bridge between the two: skills the user actually saves through the engine (skill.saved)
// must land on the shelf next to the seed catalog. taskStore only ever holds the *latest* saved
// skill (and clears it on the next request), so this store keeps the durable, accumulating list.
// We subscribe to taskStore once at module init (below) and fold each new save in via addSavedSkill,
// which keeps the wiring in the store layer -- the panel just renders, it doesn't have to babysit an
// effect, and saves accumulate even while the Skills tab isn't mounted.
import { create } from "zustand";
import {
  SKILLS,
  PLUGINS,
  SUBAGENTS,
  type SkillItem,
  type PluginItem,
  type SubagentItem,
} from "../data/catalog";
import { useTaskStore, type SavedSkill } from "./taskStore";

export type DashSection =
  | "skills"
  | "creator"
  | "agent"
  | "connections"
  | "activity"
  | "technical";

interface DashboardState {
  // Top-nav model: `home` true => the Marketplace storefront is the main view (the landing).
  // Selecting any tab (setSection) drops out of home into that section's full-area view; the
  // brand / Home button returns to home. `section` still names WHICH tab is selected so the tab
  // bar can highlight it and the view host knows which panel to render.
  home: boolean;
  section: DashSection;
  skills: SkillItem[];
  plugins: PluginItem[];
  subagents: SubagentItem[];
  // The subagent the user clicked "Use" on, surfaced into the Ask bar as a prefilled "As {name}"
  // chip. Transient UI only -- it picks WHO the next request is composed as, then clears once sent or
  // dismissed. Deliberately NOT persisted: it's a momentary intent, not a saved preference.
  activeSubagent: SubagentItem | null;
  savedSkills: SkillItem[]; // skills the user saved via the engine, newest first; accumulates
  // Ids the user removed this session. Removing a skill is a deliberate "take it off my shelf"
  // action, so a re-emitted skill.saved for the same id must NOT silently put it back (the engine
  // can re-fire that event); addSavedSkill checks this list and skips anything in it. In-session
  // only -- not persisted -- so a fresh launch reseeds the full catalog.
  removedIds: string[];
  // Agents the user published to the live marketplace this session (Deploy or Sell). In-session
  // only -- the listing on the marketplace-server is the durable record; this just lets an agent
  // card show its "Listed" state without re-querying. Holds agent ids.
  publishedAgentIds: string[];
  setSection: (s: DashSection) => void;
  goHome: () => void;
  toggleSkill: (id: string) => void;
  removeSkill: (id: string) => void;
  togglePlugin: (id: string) => void;
  toggleSubagent: (id: string) => void;
  addSubagent: (input: { name: string; role: string; instructions: string }) => void;
  removeSubagent: (id: string) => void;
  useSubagent: (id: string) => void;
  clearActiveSubagent: () => void;
  addSavedSkill: (saved: SavedSkill) => void;
  // Promote a skill into a standalone agent (one skill -> one agent). Seeds the agent's name/role
  // from the skill, turns the source skill on, and switches to the My Agents tab so the new agent
  // is visible. No-op create (just surfaces My Agents) if an agent was already made from this skill.
  makeAgentFromSkill: (skillId: string) => void;
  markAgentPublished: (agentId: string) => void;
}

// Clone the catalog arrays/objects so toggling never mutates the shared module-level constants
// (which would leak state across a hot reload / a future second store instance).
const seedSkills = (): SkillItem[] =>
  SKILLS.map((s) => ({ ...s, tags: [...s.tags] }));
const seedPlugins = (): PluginItem[] => PLUGINS.map((p) => ({ ...p }));
const SUBAGENT_STORAGE_KEY = "crash-subagents";
const seedSubagents = (): SubagentItem[] => [
  ...SUBAGENTS.map((a) => ({ ...a })),
  ...loadCustomSubagents(),
];

function loadCustomSubagents(): SubagentItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SUBAGENT_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a.name === "string" && typeof a.role === "string")
      .map((a) => ({
        id: typeof a.id === "string" ? a.id : `agent-${Date.now()}`,
        icon: typeof a.icon === "string" ? a.icon : "🤖",
        name: a.name,
        role: a.role,
        instructions: typeof a.instructions === "string" ? a.instructions : "",
        enabled: typeof a.enabled === "boolean" ? a.enabled : true,
        custom: true,
        ...(typeof a.fromSkill === "string" ? { fromSkill: a.fromSkill } : {}),
      }));
  } catch {
    return [];
  }
}

function persistCustomSubagents(subagents: SubagentItem[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    SUBAGENT_STORAGE_KEY,
    JSON.stringify(subagents.filter((a) => a.custom)),
  );
}

// Turn an engine SavedSkill (just id/name/path) into a full catalog-shaped SkillItem. Saved skills
// carry no emoji/level/tags of their own, so we supply friendly defaults and tag them so the panel
// can flag them as the user's own. Prefixing the id keeps it from ever colliding with a seed id.
const SAVED_ID_PREFIX = "saved:";
function toSkillItem(saved: SavedSkill): SkillItem {
  return {
    id: `${SAVED_ID_PREFIX}${saved.skillId}`,
    icon: "⭐",
    name: saved.name,
    blurb: "A skill you taught Crash. It is saved and ready to use.",
    tags: ["Yours"],
    enabled: true,
    level: "core",
  };
}

export const useDashboardStore = create<DashboardState>((set) => ({
  home: true,
  section: "skills",
  skills: seedSkills(),
  plugins: seedPlugins(),
  subagents: seedSubagents(),
  activeSubagent: null,
  savedSkills: [],
  removedIds: [],
  publishedAgentIds: [],
  // Selecting a tab always leaves the marketplace home -- the section view takes over the stage.
  setSection: (section) => set({ section, home: false }),
  goHome: () => set({ home: true }),
  toggleSkill: (id) =>
    set((st) => ({
      skills: st.skills.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
      savedSkills: st.savedSkills.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
    })),
  // Drop a skill off the shelf. Mirror toggleSkill's "touch BOTH arrays by id" shape -- a row can be
  // either a seed skill or a saved one, and the row only knows the id -- so we filter both. We also
  // record the id in removedIds so the skill.saved bridge won't revive it if the engine re-emits
  // (see addSavedSkill). De-dupe the id push so repeat removes can't grow the list unbounded.
  removeSkill: (id) =>
    set((st) => ({
      skills: st.skills.filter((s) => s.id !== id),
      savedSkills: st.savedSkills.filter((s) => s.id !== id),
      removedIds: st.removedIds.includes(id)
        ? st.removedIds
        : [...st.removedIds, id],
    })),
  togglePlugin: (id) =>
    set((st) => ({
      plugins: st.plugins.map((p) =>
        p.id === id ? { ...p, connected: !p.connected } : p,
      ),
    })),
  toggleSubagent: (id) =>
    set((st) => {
      const subagents = st.subagents.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a,
      );
      persistCustomSubagents(subagents);
      return { subagents };
    }),
  addSubagent: (input) =>
    set((st) => {
      const name = input.name.trim();
      if (!name) return {};
      const subagent: SubagentItem = {
        id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        icon: "🤖",
        name,
        role: input.role.trim() || "Custom helper",
        instructions: input.instructions.trim(),
        enabled: true,
        custom: true,
      };
      const subagents = [subagent, ...st.subagents];
      persistCustomSubagents(subagents);
      return { subagents };
    }),
  removeSubagent: (id) =>
    set((st) => {
      const subagents = st.subagents.filter((a) => a.id !== id || !a.custom);
      persistCustomSubagents(subagents);
      return { subagents };
    }),
  // "Use" a subagent: load it as the active composer identity for the Ask bar. Look it up by id off
  // the live list (so a freshly-created custom agent works too); fall back to null if it's gone.
  useSubagent: (id) =>
    set((st) => ({
      activeSubagent: st.subagents.find((a) => a.id === id) ?? null,
    })),
  clearActiveSubagent: () => set({ activeSubagent: null }),
  addSavedSkill: (saved) =>
    set((st) => {
      const item = toSkillItem(saved);
      // If the user already removed this skill this session, stay removed: the engine can re-emit
      // skill.saved for the same id, and silently re-adding it would undo a deliberate removal. Skip
      // it (no-op set) -- a fresh launch reseeds everything, so this only governs the live session.
      if (st.removedIds.includes(item.id)) {
        return {};
      }
      // Dedupe by id: a re-save of the same skillId updates the existing card in place rather than
      // stacking a duplicate (the engine can re-emit skill.saved for the same skill).
      if (st.savedSkills.some((s) => s.id === item.id)) {
        return {
          savedSkills: st.savedSkills.map((s) =>
            s.id === item.id ? { ...s, name: item.name } : s,
          ),
        };
      }
      return { savedSkills: [item, ...st.savedSkills] }; // newest first
    }),
  // Turn a skill into an agent. The skill's name/blurb seed the agent's identity, and we compose a
  // minimal runnable instruction from them so the agent's Execute has something concrete to act on.
  // Mirrors addSubagent's id scheme + persistence so a promoted agent survives a reload like any
  // custom one. One skill -> one agent: if this skill was already promoted, we don't stack another.
  makeAgentFromSkill: (skillId) =>
    set((st) => {
      const skill =
        st.skills.find((s) => s.id === skillId) ??
        st.savedSkills.find((s) => s.id === skillId);
      if (!skill) return {};
      if (st.subagents.some((a) => a.fromSkill === skillId)) {
        return { section: "agent", home: false };
      }
      const subagent: SubagentItem = {
        id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        icon: skill.icon,
        name: skill.name,
        role: skill.blurb,
        instructions: `You are the "${skill.name}" agent. ${skill.blurb}`,
        enabled: true,
        custom: true,
        fromSkill: skillId,
      };
      const subagents = [subagent, ...st.subagents];
      persistCustomSubagents(subagents);
      // Turn the source skill on so the new agent's capability is actually live, then surface
      // My Agents so the user lands on what they just created.
      return {
        subagents,
        skills: st.skills.map((s) =>
          s.id === skillId ? { ...s, enabled: true } : s,
        ),
        savedSkills: st.savedSkills.map((s) =>
          s.id === skillId ? { ...s, enabled: true } : s,
        ),
        section: "agent",
        home: false,
      };
    }),
  markAgentPublished: (agentId) =>
    set((st) =>
      st.publishedAgentIds.includes(agentId)
        ? {}
        : { publishedAgentIds: [...st.publishedAgentIds, agentId] },
    ),
}));

// --- Bridge: accumulate engine-saved skills onto the shelf -----------------------------------
// taskStore.savedSkill holds only the LATEST save and is reset to null on the next request, so we
// can't read it as a list. Instead we watch it: each time it transitions to a fresh non-null value
// we fold that save into this store's durable savedSkills list. zustand v4's vanilla subscribe hands
// us (state, prevState); a new skill.saved always builds a fresh object, so a reference change to a
// non-null savedSkill is a reliable "a new skill was just saved" signal. Subscribing at module init
// means saves are captured even if the Skills tab has never been opened.
useTaskStore.subscribe((state, prevState) => {
  const next = state.savedSkill;
  if (next && next !== prevState.savedSkill) {
    useDashboardStore.getState().addSavedSkill(next);
  }
});
