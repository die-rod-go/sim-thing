import { findAgent } from "../state/client-state";
import { CharacterSheet } from "./CharacterSheet";
import { usePanelContext } from "./panel-context";
import { StoryFeed } from "./StoryFeed";

/** The story of the whole village, or one villager's sheet while someone is selected. */
export function SidePanel() {
  const { state, selectAgent } = usePanelContext();
  const agent = findAgent(state, state.inspectedAgentId);
  return (
    <aside className="side-panel">
      {agent ? (
        <CharacterSheet key={agent.id} agent={agent} onClose={() => selectAgent(null)} />
      ) : (
        <>
          <header className="panel-header">
            <h2>Story</h2>
            <span className="muted">Click a villager to see what they think</span>
          </header>
          <div className="panel-scroll">
            <StoryFeed />
          </div>
        </>
      )}
    </aside>
  );
}
