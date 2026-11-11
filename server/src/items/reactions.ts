import type { Reaction } from "@village/shared";

/**
 * The reactions a stimulus sets off in a receiver with these properties and conditions, in file
 * order. All are judged against the receiver as it was when the stimulus arrived, so one
 * reaction's effects can't stop or start another for the same stimulus.
 */
export function findMatchingReactions(
  reactions: readonly Reaction[],
  stimulus: string,
  receiverTraits: ReadonlySet<string>,
): Reaction[] {
  return reactions.filter(
    (reaction) =>
      reaction.stimulus === stimulus &&
      (reaction.property === undefined || receiverTraits.has(reaction.property)) &&
      (reaction.condition === undefined || receiverTraits.has(reaction.condition)) &&
      (reaction.unless === undefined || !receiverTraits.has(reaction.unless)),
  );
}
