import { useMemo } from "react";
import { toSimTime, type Agent } from "@village/shared";
import { buildDiary } from "../format/moments";
import { usePanelContext } from "./panel-context";
import { EmptyNote } from "./widgets";

/** The agent's night reflections as a diary, one entry per day, newest first. */
export function DiaryTab({ agent }: { agent: Agent }) {
  const { state } = usePanelContext();
  const entries = useMemo(
    () => buildDiary(state.moments, agent.id, (tick) => toSimTime(tick, state.timeSettings).day),
    [state.moments, agent.id, state.timeSettings],
  );
  if (entries.length === 0) {
    return <EmptyNote>{agent.name} hasn't written a night reflection yet.</EmptyNote>;
  }
  return (
    <ol className="diary">
      {entries.map((entry) => (
        <li key={entry.momentId} className="diary-entry">
          <h4 className="diary-day">Day {entry.day}</h4>
          <p className="prose">{entry.summary}</p>
          {entry.moodEntry && (
            <p className="diary-mood">
              Feeling <em className="mood">{entry.moodEntry}</em>
            </p>
          )}
          {entry.insights.length > 0 && (
            <ul className="bullet-list diary-insights">
              {entry.insights.map((insight, insightIndex) => (
                <li key={insightIndex}>{insight}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
