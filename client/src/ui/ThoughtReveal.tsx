import { useState, type ReactNode } from "react";

interface ThoughtRevealProps {
  thought: string | null;
  /** Present when the prompt behind this line is loaded and can be opened. */
  onViewPrompt?: (() => void) | undefined;
  children: ReactNode;
}

/** A spoken line with a small 💭 that unfolds what the speaker was thinking when they said it. */
export function ThoughtReveal({ thought, onViewPrompt, children }: ThoughtRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  if (!thought) return <>{children}</>;
  return (
    <div className="thought-reveal">
      <div className="thought-reveal-line">
        {children}
        <button
          className={isRevealed ? "thought-toggle is-active" : "thought-toggle"}
          onClick={() => setIsRevealed(!isRevealed)}
          aria-expanded={isRevealed}
          title={isRevealed ? "Hide what they were thinking" : "What were they thinking?"}
        >
          💭
        </button>
      </div>
      {isRevealed && (
        <p className="revealed-thought">
          {thought}
          {onViewPrompt && (
            <button className="text-button" onClick={onViewPrompt}>
              view prompt
            </button>
          )}
        </p>
      )}
    </div>
  );
}
