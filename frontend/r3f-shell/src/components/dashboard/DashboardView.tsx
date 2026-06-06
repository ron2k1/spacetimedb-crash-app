// DashboardView -- the full-area stage for whichever dashboard TAB is active. It replaces the old
// right-side DashboardPanel: the tabbed redesign moved section navigation up to the app bar (TopBar)
// and made the storefront and the tabs MUTUALLY EXCLUSIVE views. When a tab is selected (home === false
// in the store) App renders this in place of the Marketplace; clicking the brand (goHome) renders the
// Marketplace again.
//
// It owns the warm parchment shell, the section header (icon + title + a live count), and the animated
// swap between the section bodies -- the SAME bodies as before, now centered in a readable column
// instead of crammed into a ~440px sidebar. The old "Technical" section has no tab of its own anymore;
// its read-only CLI mirror folds into the Activity tab (rendered beneath the run view), so the raw feed
// stays reachable without a sixth tab.
import { motion, AnimatePresence } from 'motion/react';
import { useDashboardStore } from '../../store/dashboardStore';
import { SkillsPanel } from './SkillsPanel';
import { AgentPanel } from './AgentPanel';
import { SkillCreatorPanel } from './SkillCreatorPanel';
import { ConnectionsPanel } from '../connections/ConnectionsPanel';
import { ChatPanel } from './ChatPanel';
import { useTaskStore } from '../../store/taskStore';
import { theme, FONT, SHADOW, GRADIENT } from '../../theme';
import { CONTENT_TOP, CONTENT_BOTTOM, EDGE_INSET } from './layout';
import { isTauri } from '../../files/attach';

export function DashboardView() {
  const section = useDashboardStore((s) => s.section);
  const skills = useDashboardStore((s) => s.skills);
  const subagents = useDashboardStore((s) => s.subagents);
  // Which CLI is answering, for the Ask Crash header subtitle. Prefer the typed auth.status.active;
  // fall back to the session.ready provider string. Same lockup as the TopBar provider chip.
  const authActive = useTaskStore((s) => s.authActive);
  const sessionProvider = useTaskStore((s) => s.provider);
  const cliKey = authActive ?? sessionProvider;
  const cliName = cliKey ? ({ 'claude-code': 'Claude Code', codex: 'Codex' }[cliKey] ?? cliKey) : 'your CLI';

  // Header lockup per section. The Activity/Technical sections were removed from the dashboard, so
  // only the four live tabs have entries; the cast + fallback keeps a stray section value (the union
  // still allows 'activity'/'technical') from crashing the header.
  const meta = ({
    skills: { icon: '🛠️', title: 'Skill Shelf', sub: `${skills.filter((s) => s.enabled).length} of ${skills.length} on` },
    creator: { icon: '✨', title: 'Skill Creator', sub: 'Make your own' },
    // On web the local subagent workspace is hidden (no engine to run it), so counting enabled subagents
    // would dangle -- the tab is the seller surface there. Desktop keeps the live "N active" subagent count.
    agent: {
      icon: '🤖',
      title: 'My Agents',
      sub: isTauri ? `${subagents.filter((a) => a.enabled).length} active` : 'Sell on the marketplace',
    },
    connections: { icon: '🔌', title: 'Connections', sub: 'Bring your own keys' },
    activity: { icon: '💬', title: 'Ask Crash', sub: `Talking to ${cliName}` },
  } as Record<string, { icon: string; title: string; sub: string }>)[section] ?? { icon: '•', title: 'Crash', sub: '' };

  return (
    // Outer is non-interactive so the transparent side gutters let the ambient HeroBackdrop show and
    // stay click-through; the inner card re-enables pointer events.
    <div
      style={{
        position: 'fixed',
        top: CONTENT_TOP,
        left: EDGE_INSET,
        right: EDGE_INSET,
        bottom: CONTENT_BOTTOM,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: 'min(860px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 26,
          background: theme.ui.panel,
          backdropFilter: 'blur(16px)',
          border: `1.5px solid ${theme.ui.line}`,
          boxShadow: SHADOW.panel,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            background: GRADIENT.panelHead,
            borderBottom: `1.5px solid ${theme.ui.line}`,
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              display: 'grid',
              placeItems: 'center',
              fontSize: 24,
              background: theme.ui.panelSolid,
              boxShadow: SHADOW.card,
            }}
          >
            {meta.icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 800,
                fontSize: 19,
                color: theme.ui.ink,
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
              }}
            >
              {meta.title}
            </div>
            <div style={{ fontFamily: FONT.body, fontWeight: 700, fontSize: 12, color: theme.ui.inkSoft, textTransform: 'capitalize' }}>
              {meta.sub}
            </div>
          </div>
        </div>

        {/* Scrollable body, animated per section */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {section === 'skills' && <SkillsPanel />}
              {section === 'creator' && <SkillCreatorPanel />}
              {section === 'agent' && <AgentPanel />}
              {section === 'connections' && <ConnectionsPanel />}
              {section === 'activity' && <ChatPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
