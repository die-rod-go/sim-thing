import type { ReactNode } from "react";
import { formatPercent } from "../format/formatters";

const TRAIT_SLIDER_STEP = 0.01;
const PERCENT = 100;

export function MeterBar({ label, value }: { label: string; value: number }) {
  const clampedValue = Math.min(Math.max(value, 0), 1);
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${clampedValue * PERCENT}%` }} />
      </div>
      <span className="meter-value">{formatPercent(clampedValue)}</span>
    </div>
  );
}

export function TraitSlider({ label, value }: { label: string; value: number }) {
  return (
    <label className="trait">
      <span className="meter-label">{label}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={TRAIT_SLIDER_STEP}
        value={value}
        readOnly
        disabled
      />
      <span className="meter-value">{value.toFixed(2)}</span>
    </label>
  );
}

export function StrengthBar({ strength }: { strength: number }) {
  return (
    <span className="strength" title={`strength ${strength.toFixed(2)}`}>
      <span className="strength-fill" style={{ width: `${strength * PERCENT}%` }} />
      <span className="strength-number">{strength.toFixed(2)}</span>
    </span>
  );
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="muted empty-note">{children}</p>;
}
