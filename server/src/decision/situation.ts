import { renderTemplate } from "../llm/templates";
import { describePlace } from "../memory/filing";
import { describeAroundYou, describeNotSeenLately } from "./around-you";
import type { Situation } from "./context";

const SITUATION_TEMPLATE = "situation";

/** Where the agent is, who is around, and who it hasn't seen lately, for plans and passes. */
export function describeSituation(
  situation: Situation,
  simTime: string,
  promptsDirectory?: string,
): string {
  return renderTemplate(
    SITUATION_TEMPLATE,
    {
      simTime,
      place: describePlace(situation.place),
      aroundYou: describeAroundYou(situation.aroundYou),
      notSeenLately: describeNotSeenLately(situation.aroundYou),
    },
    promptsDirectory,
  );
}
