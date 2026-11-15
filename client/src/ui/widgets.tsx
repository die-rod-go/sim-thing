import type { ReactNode } from "react";
import type { NeedName, TraitName } from "@village/shared";
import {
  describeHealth,
  describeNeed,
  describeTrait,
  type NeedLevel,
} from "../format/character-sheet";
import { formatPercent } from "../format/formatters";
import { usePanelContext } from "./panel-context";

const PERCENT = 100;
const HALF = 50;

/** A 0–1 level as a colored word with a thin bar, the way a character sheet would phrase it. */
function LevelRow({ label, level, value }: { label: string; level: NeedLevel; value: number }) {
  const clampedValue = Math.min(Math.max(value, 0), 1);
  return (
    <div className="need-row" title={`${label} ${formatPercent(clampedValue)}`}>
      <span className="need-name">{label}</span>
      <span className={`need-word level-${level.levelIndex}`}>{level.word}</span>
      <span className="need-track">
        <span
          className={`need-fill level-${level.levelIndex}`}
          style={{ width: `${clampedValue * PERCENT}%` }}
        />
      </span>
    </div>
  );
}

export function NeedRow({ needName, value }: { needName: NeedName; value: number }) {
  return <LevelRow label={needName} level={describeNeed(needName, value)} value={value} />;
}

export function HealthRow({ value }: { value: number }) {
  return <LevelRow label="health" level={describeHealth(value)} value={value} />;
}

/** A trait as a phrase over a bar that grows left or right from the middle. */
export function TraitRow({ traitName, value }: { traitName: TraitName; value: number }) {
  const description = describeTrait(traitName, value);
  const clampedValue = Math.min(Math.max(value, -1), 1);
  const extent = Math.abs(clampedValue) * HALF;
  const fillStyle =
    clampedValue < 0
      ? { left: `${HALF - extent}%`, width: `${extent}%` }
      : { left: `${HALF}%`, width: `${extent}%` };
  return (
    <div className="trait-row" title={`${traitName} ${value.toFixed(2)}`}>
      <span className="trait-name">{traitName}</span>
      <span className={`trait-phrase intensity-${description.intensity}`}>
        {description.phrase}
      </span>
      <span className="trait-track">
        <span className="trait-midline" />
        <span className="trait-fill" style={fillStyle} />
      </span>
    </div>
  );
}

/** An agent's name in their map color; clicking it opens their character sheet. */
export function AgentName({ agentId, name }: { agentId: string; name: string }) {
  const { agentColors, selectAgent } = usePanelContext();
  const color = agentColors.get(agentId);
  if (color === undefined) return <span className="agent-name">{name}</span>;
  return (
    <button
      className="agent-name is-link"
      style={{ color }}
      onClick={() => selectAgent(agentId)}
      title={`Open ${name}'s sheet`}
    >
      {name}
    </button>
  );
}

export function ColorDot({ agentId }: { agentId: string }) {
  const { agentColors } = usePanelContext();
  return <span className="color-dot" style={{ background: agentColors.get(agentId) }} />;
}

export function PanelSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel-section">
      <h3>
        <span>{title}</span>
        {aside !== undefined && <span className="section-aside">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="muted empty-note">{children}</p>;
}

export function TabBar<TabName extends string>({
  tabs,
  activeTab,
  onChange,
  className,
}: {
  tabs: readonly { name: TabName; label: ReactNode }[];
  activeTab: TabName;
  onChange: (tab: TabName) => void;
  className: string;
}) {
  return (
    <nav className={className}>
      {tabs.map((tab) => (
        <button
          key={tab.name}
          className={tab.name === activeTab ? "tab is-active" : "tab"}
          onClick={() => onChange(tab.name)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
