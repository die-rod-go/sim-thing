import type { PlayerPerson, PlayerView } from "@village/shared";

/** Where the clock stands with the player, in one line for the top of their panel. */
export function describeTurn(view: PlayerView, isPaused: boolean): string {
  if (view.isDead) return "Your character is dead.";
  if (view.pendingActs.length > 0) {
    const next = `Next: ${view.pendingActs.join("; then ")}`;
    return isPaused ? `${next} (when the clock runs again)` : next;
  }
  if (view.isYourTurn) {
    return view.turnReason === null ? "Your turn." : `Your turn: ${view.turnReason}.`;
  }
  return view.doing === null ? "Waiting for the clock." : `${capitalize(view.doing)}…`;
}

/** "within reach, hears you", "6 tiles away, too far to hear you". */
export function describeNearness(person: PlayerPerson): string {
  const distance = person.isInReach
    ? "within reach"
    : `${person.distanceTiles} ${person.distanceTiles === 1 ? "tile" : "tiles"} away`;
  if (person.isDead) return distance;
  const hearing = person.canHearWhisper
    ? "would hear a whisper"
    : person.canHearYou
      ? "hears you"
      : "too far to hear you";
  return `${distance}, ${hearing}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
