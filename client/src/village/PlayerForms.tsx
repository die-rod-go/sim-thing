import { useState, type FormEvent } from "react";
import type {
  CurrentAction,
  ItemDefinition,
  PlayerCreature,
  PlayerPerson,
  PlayerThing,
  Volume,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { describeNearness } from "../format/player-lines";
import type { SendPlayerAct } from "./PlayerActions";
import { buildGiveAct, buildTalkAct } from "./player-controls";

/** The talk box's element id, so a key on the map can put the cursor in it. */
export const PLAYER_TALK_INPUT_ID = "player-talk-input";

const VOLUMES: readonly Volume[] = ["whisper", "normal", "shout"];

/** Words to say, kept in the box until they are sent. */
export function TalkBox({
  currentAction,
  onAct,
}: {
  currentAction: CurrentAction | null;
  onAct: SendPlayerAct;
}) {
  const [words, setWords] = useState("");
  const [volume, setVolume] = useState<Volume>("normal");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const act = buildTalkAct(words, volume, currentAction);
    if (act !== null && onAct(act)) setWords("");
  };
  return (
    <form className="player-talk" onSubmit={submit}>
      <input
        id={PLAYER_TALK_INPUT_ID}
        type="text"
        placeholder="Say something… (Enter)"
        value={words}
        onChange={(event) => setWords(event.target.value)}
      />
      <select value={volume} onChange={(event) => setVolume(event.target.value as Volume)}>
        {VOLUMES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button type="submit" disabled={words.trim() === ""}>
        Say
      </button>
    </form>
  );
}

/** Hands something carried to someone in sight, asking something back if the player wants. */
function GiveForm({
  people,
  carrying,
  itemDefinitions,
  onAct,
}: {
  people: readonly PlayerPerson[];
  carrying: readonly PlayerThing[];
  itemDefinitions: readonly ItemDefinition[];
  onAct: SendPlayerAct;
}) {
  const itemNames = [...new Set(carrying.map((thing) => thing.name))];
  const [person, setPerson] = useState(people[0]?.name ?? "");
  const [item, setItem] = useState(itemNames[0] ?? "");
  const [amount, setAmount] = useState(1);
  const [inReturn, setInReturn] = useState("");
  const [inReturnAmount, setInReturnAmount] = useState(1);
  const chosenPerson = people.some((candidate) => candidate.name === person)
    ? person
    : (people[0]?.name ?? "");
  const chosenItem = itemNames.includes(item) ? item : (itemNames[0] ?? "");
  const canGive = chosenPerson !== "" && chosenItem !== "";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canGive) return;
    onAct(
      buildGiveAct({ person: chosenPerson, item: chosenItem, amount, inReturn, inReturnAmount }),
    );
  };
  return (
    <form className="player-give" onSubmit={submit}>
      <strong>Give</strong>
      <input
        type="number"
        min={1}
        value={amount}
        onChange={(event) => setAmount(Math.max(1, Number(event.target.value) || 1))}
      />
      <select value={chosenItem} onChange={(event) => setItem(event.target.value)}>
        {itemNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      to
      <select value={chosenPerson} onChange={(event) => setPerson(event.target.value)}>
        {people.map((candidate) => (
          <option key={candidate.name} value={candidate.name}>
            {candidate.name}
          </option>
        ))}
      </select>
      for
      <input
        type="number"
        min={1}
        value={inReturnAmount}
        disabled={inReturn === ""}
        onChange={(event) => setInReturnAmount(Math.max(1, Number(event.target.value) || 1))}
      />
      <select value={inReturn} onChange={(event) => setInReturn(event.target.value)}>
        <option value="">nothing</option>
        {itemDefinitions.map((definition) => (
          <option key={definition.id} value={definition.name}>
            {definition.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!canGive}>
        Offer
      </button>
    </form>
  );
}

/** Everyone in sight with how near they are, and walking up to, following or giving to them. */
export function PeopleList({
  people,
  creatures,
  carrying,
  itemDefinitions,
  onAct,
}: {
  people: readonly PlayerPerson[];
  creatures: readonly PlayerCreature[];
  carrying: readonly PlayerThing[];
  itemDefinitions: readonly ItemDefinition[];
  onAct: SendPlayerAct;
}) {
  const living = people.filter((person) => !person.isDead);
  return (
    <div className="player-people">
      {people.length === 0 && <p className="muted">Nobody in sight.</p>}
      <ul className="player-things">
        {people.map((person) => (
          <li key={person.name}>
            <span className="player-thing-text">{person.name}</span>{" "}
            <span className="muted">
              {person.doing}; {describeNearness(person)}
            </span>
            {!person.isDead && (
              <div className="player-options">
                <button onClick={() => onAct({ action: "walk_to", target: person.name })}>
                  walk to
                </button>
                <button onClick={() => onAct({ action: "follow", target: person.name })}>
                  follow
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {creatures.length > 0 && (
        <p className="muted">
          Also in sight:{" "}
          {creatures
            .map((creature) => `${creature.name} (${creature.distanceTiles} tiles away)`)
            .join(", ")}
        </p>
      )}
      {living.length > 0 && carrying.length > 0 && (
        <GiveForm
          people={living}
          carrying={carrying}
          itemDefinitions={itemDefinitions}
          onAct={onAct}
        />
      )}
    </div>
  );
}

/** Walking somewhere by name, and waiting a while where the agent stands. */
export function GoAndWait({
  destinations,
  onAct,
}: {
  destinations: readonly string[];
  onAct: SendPlayerAct;
}) {
  const [destination, setDestination] = useState(destinations[0] ?? "");
  const [minutes, setMinutes] = useState<number>(clientConfig.player.defaultWaitMinutes);
  const go = (event: FormEvent) => {
    event.preventDefault();
    if (destination !== "") onAct({ action: "walk_to", target: destination });
  };
  const wait = (event: FormEvent) => {
    event.preventDefault();
    onAct({ action: "wait", minutes });
  };
  return (
    <div className="player-go">
      <form onSubmit={go}>
        <select value={destination} onChange={(event) => setDestination(event.target.value)}>
          {destinations.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={destination === ""}>
          Walk there
        </button>
      </form>
      <form onSubmit={wait}>
        <input
          type="number"
          min={1}
          value={minutes}
          onChange={(event) => setMinutes(Math.max(1, Number(event.target.value) || 1))}
        />
        <button type="submit">Wait (minutes)</button>
      </form>
      <p className="muted">Or click the map to walk, and use the arrow keys or WASD to move.</p>
    </div>
  );
}
