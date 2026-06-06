// AgentPanel -- local agent workspace. Users can keep the built-in local tools connected and create
// lightweight subagents that describe a focused role Crash can reuse.
import { useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { Button, Card, Chip, SectionLabel, Toggle } from '../../ui/primitives';
import { theme, FONT } from '../../theme';
import type { PluginItem, SubagentItem } from '../../data/catalog';
import { ListListingModal } from '../marketplace/ListListingModal';
import { useMarketplaceContext } from '../../net/MarketplaceProvider';
import { isTauri } from '../../files/attach';

function fieldStyle(kind: 'input' | 'textarea' = 'input') {
  return {
    width: '100%',
    boxSizing: 'border-box' as const,
    minHeight: kind === 'textarea' ? 82 : undefined,
    resize: kind === 'textarea' ? ('vertical' as const) : undefined,
    borderRadius: 12,
    border: `1.5px solid ${theme.ui.line}`,
    background: theme.ui.chipBg,
    color: theme.ui.ink,
    outline: 'none',
    padding: '10px 11px',
    fontFamily: FONT.body,
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1.35,
  };
}

function SubagentForm() {
  const addSubagent = useDashboardStore((s) => s.addSubagent);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [instructions, setInstructions] = useState('');
  const canCreate = name.trim().length > 0;

  const create = () => {
    if (!canCreate) return;
    addSubagent({ name, role, instructions });
    setName('');
    setRole('');
    setInstructions('');
  };

  return (
    <Card index={0} style={{ marginBottom: 14, borderColor: `${theme.ui.accent}88` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 16, color: theme.ui.ink }}>
            Create subagent
          </div>
          <div style={{ fontFamily: FONT.body, fontWeight: 700, fontSize: 12, color: theme.ui.inkFaint }}>
            Role, focus, instructions
          </div>
        </div>
        <Chip tone="accent">local</Chip>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Name"
          style={fieldStyle()}
        />
        <input
          value={role}
          onChange={(e) => setRole(e.currentTarget.value)}
          placeholder="Role"
          style={fieldStyle()}
        />
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.currentTarget.value)}
          placeholder="Instructions"
          style={fieldStyle('textarea')}
        />
        <Button onClick={create} disabled={!canCreate} variant="teal">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Plus size={15} aria-hidden />
            Create agent
          </span>
        </Button>
      </div>
    </Card>
  );
}

function SubagentRow({ agent, index }: { agent: SubagentItem; index: number }) {
  const toggleSubagent = useDashboardStore((s) => s.toggleSubagent);
  const removeSubagent = useDashboardStore((s) => s.removeSubagent);
  const useSubagent = useDashboardStore((s) => s.useSubagent);

  return (
    <Card index={index} style={{ marginBottom: 12, opacity: agent.enabled ? 1 : 0.72 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span
          style={{
            flex: '0 0 auto',
            width: 46,
            height: 46,
            borderRadius: 14,
            display: 'grid',
            placeItems: 'center',
            fontSize: 24,
            background: agent.enabled ? theme.ui.accentSoft : theme.ui.chipBg,
          }}
        >
          {agent.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 16, color: theme.ui.ink }}>
              {agent.name}
            </span>
            <Chip tone={agent.enabled ? 'accent' : 'neutral'}>{agent.enabled ? 'on' : 'off'}</Chip>
            {agent.custom ? <Chip tone="teal">yours</Chip> : null}
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 1.45, color: theme.ui.inkSoft }}>
            {agent.role}
          </div>
          {agent.instructions ? (
            <div
              style={{
                marginTop: 7,
                fontFamily: FONT.body,
                fontSize: 11.5,
                lineHeight: 1.4,
                color: theme.ui.inkFaint,
              }}
            >
              {agent.instructions}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <Toggle
            on={agent.enabled}
            onToggle={() => toggleSubagent(agent.id)}
            accent={theme.ui.accent}
            label={`${agent.enabled ? 'Disable' : 'Enable'} ${agent.name}`}
          />
          {/* Only an enabled subagent can be "used": clicking sends it to the Ask bar as the active
              composer identity. Visually subordinate to the Create form -- a compact pill, not a
              primary button. The PromptBar reacts on its own, so we don't switch dashboard sections. */}
          {agent.enabled ? (
            <button
              type="button"
              onClick={() => useSubagent(agent.id)}
              title={`Use ${agent.name}`}
              aria-label={`Use ${agent.name}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 28,
                padding: '0 10px',
                borderRadius: 10,
                border: `1px solid ${theme.ui.teal}66`,
                background: theme.ui.tealSoft,
                color: theme.ui.teal,
                fontFamily: FONT.body,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Use
              <ArrowRight size={13} aria-hidden />
            </button>
          ) : null}
          {agent.custom ? (
            <button
              type="button"
              onClick={() => removeSubagent(agent.id)}
              title={`Remove ${agent.name}`}
              aria-label={`Remove ${agent.name}`}
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: 28,
                height: 28,
                borderRadius: 10,
                border: `1px solid ${theme.ui.line}`,
                background: theme.ui.chipBg,
                color: theme.ui.inkSoft,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ToolRow({ plugin, index }: { plugin: PluginItem; index: number }) {
  const togglePlugin = useDashboardStore((s) => s.togglePlugin);
  return (
    <Card index={index} style={{ marginBottom: 12, opacity: plugin.connected ? 1 : 0.72 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span
          style={{
            flex: '0 0 auto',
            width: 42,
            height: 42,
            borderRadius: 13,
            display: 'grid',
            placeItems: 'center',
            fontSize: 23,
            background: plugin.connected ? theme.ui.tealSoft : theme.ui.chipBg,
          }}
        >
          {plugin.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 15, color: theme.ui.ink }}>
              {plugin.name}
            </span>
            <Chip tone={plugin.connected ? 'teal' : 'neutral'}>{plugin.connected ? 'on' : 'off'}</Chip>
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 12.5, lineHeight: 1.42, color: theme.ui.inkSoft }}>
            {plugin.blurb}
          </div>
          <div style={{ marginTop: 7, fontFamily: FONT.body, fontSize: 11, fontWeight: 700, color: theme.ui.inkFaint }}>
            {plugin.provider}
          </div>
        </div>
        <Toggle
          on={plugin.connected}
          onToggle={() => togglePlugin(plugin.id)}
          accent={theme.ui.teal}
          label={`${plugin.connected ? 'Disconnect' : 'Connect'} ${plugin.name}`}
        />
      </div>
    </Card>
  );
}

// PublishToMarket -- the discoverable bridge from "my agents" to the shared marketplace, mirroring the
// storefront's "+ List something" so a seller can reach the flow from the workspace where they manage
// agents. The seller + pricing form itself lives in ListListingModal (category, name, icon, a plain-
// language blurb, a pricing label with USDC presets, and a "listed by you / an agent" choice) -- this
// card is just the entry point. It is marketplace-server-backed (createListing -> POST /api/listings),
// NOT engine-backed, so it works identically in the Azure web demo and the packaged desktop app. On a
// successful list the modal closes itself and the new card appears live on the storefront grid.
function PublishToMarket() {
  const { online, createListing } = useMarketplaceContext();
  const [selling, setSelling] = useState(false);

  return (
    <Card index={0} style={{ marginBottom: 18, borderColor: `${theme.ui.accent}88` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden
          style={{
            flex: '0 0 auto',
            width: 46,
            height: 46,
            borderRadius: 14,
            display: 'grid',
            placeItems: 'center',
            fontSize: 24,
            background: `linear-gradient(135deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
            boxShadow: `0 6px 14px ${theme.ui.accent}55`,
          }}
        >
          🏷️
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 16, color: theme.ui.ink }}>
            Sell an agent on the marketplace
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 12.5, lineHeight: 1.45, color: theme.ui.inkSoft }}>
            List one of your agents for others to hire, and set how it's priced.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 13 }}>
        <Button onClick={() => setSelling(true)} full>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Plus size={15} aria-hidden />
            List an agent
          </span>
        </Button>
      </div>
      <ListListingModal
        open={selling}
        online={online}
        onClose={() => setSelling(false)}
        onSubmit={createListing}
      />
    </Card>
  );
}

export function AgentPanel() {
  const subagents = useDashboardStore((s) => s.subagents);
  const plugins = useDashboardStore((s) => s.plugins);

  // The local subagent + tools workspace below only does something REAL in the desktop build, where the
  // Crash engine and the Ask prompt bar exist to consume it: "Use" puts a subagent in front of the prompt
  // bar, and the tool toggles connect engine-side plugins. In the web demo there is no local engine, so
  // those controls would be dead ends -- "Use" would target a prompt bar that isn't mounted, and the tool
  // toggles would flip cosmetic state nothing reads. So on web we hide them and keep this tab on the one
  // thing that is fully live here: listing an agent for sale on the shared marketplace (marketplace-server
  // backed, identical on web + desktop). Browsing and running agents happens on Home.
  if (!isTauri) {
    return (
      <div>
        <PublishToMarket />
        <Card index={1}>
          <div
            style={{
              fontFamily: FONT.display,
              fontWeight: 800,
              fontSize: 15,
              color: theme.ui.ink,
              marginBottom: 5,
            }}
          >
            After you list it
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 1.5, color: theme.ui.inkSoft }}>
            Your agent shows up on the marketplace on Home, where anyone can open it and run it for real --
            it pays for its own tools over x402 as it works, and you earn on every run at the price you set.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PublishToMarket />
      <SubagentForm />
      <SectionLabel>Subagents</SectionLabel>
      {subagents.map((agent, i) => (
        <SubagentRow key={agent.id} agent={agent} index={i + 1} />
      ))}
      <SectionLabel>Tools</SectionLabel>
      {plugins.map((p, i) => (
        <ToolRow key={p.id} plugin={p} index={i + subagents.length + 2} />
      ))}
    </div>
  );
}
