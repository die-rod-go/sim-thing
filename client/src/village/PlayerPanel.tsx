import { useEffect, useRef } from "react";
import {
  NEED_NAMES,
  readAgentHealth,
  type Agent,
  type ItemDefinition,
  type PlayerView,
  type ThingCatalog,
} from "@village/shared";
import "../styles/player.css";
import { clientConfig } from "../client-config";
import { parseStoredChoice } from "../format/stored-preferences";
import { describeTurn } from "../format/player-lines";
import { useStoredState } from "../ui/use-stored-state";
import { HealthRow, NeedRow, TabBar } from "../ui/widgets";
import { OptionButtons, ThingList, type SendPlayerAct } from "./PlayerActions";
import { GoAndWait, PeopleList, TalkBox } from "./PlayerForms";

const PANEL_TAB_NAMES = ["here", "carrying", "people", "go", "body", "journal"] as const;
type PanelTabName = (typeof PANEL_TAB_NAMES)[number];

const PANEL_TAB_LABELS: Record<PanelTabName, string> = {
  here: "Here",
  carrying: "Carrying",
  people: "People",
  go: "Go",
  body: "Body",
  journal: "Journal",
};

const parsePanelTab = (raw: string | null) => parseStoredChoice(raw, PANEL_TAB_NAMES);

interface PlayerPanelProps {
  view: PlayerView;
  agent: Agent;
  catalog: ThingCatalog;
  itemDefinitions: readonly ItemDefinition[];
  isPaused: boolean;
  refusal: string | null;
  isSeeingAsPlayer: boolean;
  onSeeingAsPlayerChange: (isOn: boolean) => void;
  onAct: SendPlayerAct;
  onStopPlaying: () => void;
}

/** Where the clock stands with the player, what they are doing, and keep going or stop. */
function TurnStatus({
  view,
  isPaused,
  refusal,
  onAct,
}: Pick<PlayerPanelProps, "view" | "isPaused" | "refusal" | "onAct">) {
  const canCarryOn = view.isYourTurn && view.doing !== null;
  const canStop = !view.isYourTurn && view.doing !== null && view.pendingActs.length === 0;
  return (
    <div className={view.isYourTurn ? "player-turn is-your-turn" : "player-turn"}>
      <p>{describeTurn(view, isPaused)}</p>
      {canCarryOn && (
        <button onClick={() => onAct({ action: "continue" })}>Carry on {view.doing}</button>
      )}
      {canStop && (
        <button onClick={() => onAct({ action: "wait", minutes: 1 })} title="Stop and stand still">
          Stop
        </button>
      )}
      {view.lastFailure && <p className="player-failure">{view.lastFailure}</p>}
      {refusal && <p className="player-failure">{refusal}</p>}
    </div>
  );
}

function OfferPrompt({ view, onAct }: Pick<PlayerPanelProps, "view" | "onAct">) {
  const { offer, ownOffer } = view;
  const answer = (choice: "accept" | "decline") =>
    offer && onAct({ action: "continue", offer: { eventId: offer.eventId, answer: choice } });
  return (
    <>
      {offer && (
        <div className="player-offer">
          <span>
            {offer.giverName} offers you {offer.itemText}.
          </span>
          <button onClick={() => answer("accept")}>Accept</button>
          <button onClick={() => answer("decline")}>Decline</button>
        </div>
      )}
      {ownOffer && (
        <p className="muted">
          You are offering {ownOffer.recipientName} {ownOffer.itemText}; no answer yet.
        </p>
      )}
    </>
  );
}

/** The latest of what the agent took in, newest at the bottom. */
function Journal({ entries }: { entries: readonly string[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  const shown = entries.slice(-clientConfig.player.journalEntries);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries]);
  if (shown.length === 0) return <p className="muted">Nothing yet.</p>;
  return (
    <ol className="player-journal" ref={listRef}>
      {shown.map((entry, index) => (
        <li key={`${index}|${entry}`}>{entry}</li>
      ))}
    </ol>
  );
}

function BodyStatus({ agent, catalog }: { agent: Agent; catalog: ThingCatalog }) {
  return (
    <div className="player-body">
      <HealthRow value={readAgentHealth(catalog, agent)} />
      {NEED_NAMES.map((needName) => (
        <NeedRow key={needName} needName={needName} value={agent.needs[needName]} />
      ))}
    </div>
  );
}

function PanelTabBody({ tab, ...props }: PlayerPanelProps & { tab: PanelTabName }) {
  const { view, onAct } = props;
  switch (tab) {
    case "here":
      return (
        <>
          <ThingList things={view.here} emptyText="Nothing of use here." onAct={onAct} />
          {view.bareHanded.length > 0 && (
            <div className="player-bare-handed">
              <span className="muted">Bare-handed:</span>
              <OptionButtons options={view.bareHanded} count={1} onAct={onAct} />
            </div>
          )}
        </>
      );
    case "carrying":
      return <ThingList things={view.carrying} emptyText="Carrying nothing." onAct={onAct} />;
    case "people":
      return (
        <PeopleList
          people={view.people}
          creatures={view.creatures}
          carrying={view.carrying}
          itemDefinitions={props.itemDefinitions}
          onAct={onAct}
        />
      );
    case "go":
      return <GoAndWait destinations={view.destinations} onAct={onAct} />;
    case "body":
      return <BodyStatus agent={props.agent} catalog={props.catalog} />;
    case "journal":
      return <Journal entries={view.journal} />;
  }
}

/** The player's controls for the agent they play, over the village view. */
export function PlayerPanel(props: PlayerPanelProps) {
  const { view, agent, isSeeingAsPlayer, onSeeingAsPlayerChange, onStopPlaying } = props;
  const [tab, setTab] = useStoredState<PanelTabName>(
    clientConfig.storageKeys.playerPanelTab,
    "here",
    parsePanelTab,
  );
  const tabs = PANEL_TAB_NAMES.map((name) => ({ name, label: PANEL_TAB_LABELS[name] }));
  return (
    <aside className="player-panel" aria-label={`Playing ${agent.name}`}>
      <header className="player-panel-title">
        <strong>Playing {agent.name}</strong>
        <span className="muted">{view.place}</span>
        <button onClick={onStopPlaying} title="Hand them back to the LLM">
          Stop playing
        </button>
      </header>
      <label className="player-senses-toggle">
        <input
          type="checkbox"
          checked={isSeeingAsPlayer}
          onChange={(event) => onSeeingAsPlayerChange(event.target.checked)}
        />
        See only what {agent.name} sees and hears
      </label>
      <TurnStatus {...props} />
      {view.isDead ? (
        <Journal entries={view.journal} />
      ) : (
        <>
          <OfferPrompt view={view} onAct={props.onAct} />
          <TalkBox currentAction={agent.currentAction} onAct={props.onAct} />
          <TabBar className="player-tabs" tabs={tabs} activeTab={tab} onChange={setTab} />
          <div className="player-tab-body">
            <PanelTabBody tab={tab} {...props} />
          </div>
        </>
      )}
    </aside>
  );
}
