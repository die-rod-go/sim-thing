import { useMemo, useState } from "react";
import {
  BUCKETS,
  formatSimTime,
  type AgentDetailMessage,
  type Bucket,
  type Memory,
} from "@village/shared";
import { clientConfig } from "../client-config";
import {
  countMemoriesByBucket,
  countTags,
  listMemories,
  type MemorySortOrder,
} from "../format/memory-view";
import { usePanelContext } from "./panel-context";
import { EmptyNote, StrengthBar } from "./widgets";

function MemoryRow({
  memory,
  isBucketShown,
  onTagClick,
}: {
  memory: Memory;
  isBucketShown: boolean;
  onTagClick: (tag: string) => void;
}) {
  const { state } = usePanelContext();
  return (
    <li className={`memory-row bucket-${memory.bucket}`}>
      <StrengthBar strength={memory.strength} />
      <div className="memory-main">
        <div className="memory-text">{memory.text}</div>
        <div className="memory-sub">
          <span title={`tick ${memory.tick}`}>
            {formatSimTime(memory.tick, state.timeSettings)}
          </span>
          {isBucketShown && <span className="memory-bucket">{memory.bucket}</span>}
          {memory.tags.map((tag) => (
            <button key={tag} className="memory-tag" onClick={() => onTagClick(tag)}>
              #{tag}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}

export function MemoryTab({ detail }: { detail: AgentDetailMessage }) {
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<MemorySortOrder>("newest");
  const bucketCounts = useMemo(() => countMemoriesByBucket(detail.memories), [detail.memories]);
  const tagCounts = useMemo(
    () => countTags(detail.memories).slice(0, clientConfig.ui.maxTagChips),
    [detail.memories],
  );
  const memories = useMemo(
    () => listMemories(detail.memories, { bucket, tagFilter, sortOrder }),
    [detail.memories, bucket, tagFilter, sortOrder],
  );

  return (
    <div className="memory-tab">
      <div className="chip-row">
        <button
          className={bucket === null ? "chip is-active" : "chip"}
          onClick={() => setBucket(null)}
        >
          all <span className="muted">{detail.memories.length}</span>
        </button>
        {BUCKETS.map((bucketName) => (
          <button
            key={bucketName}
            className={bucket === bucketName ? "chip is-active" : "chip"}
            onClick={() => setBucket(bucket === bucketName ? null : bucketName)}
            disabled={bucketCounts[bucketName] === 0}
          >
            {bucketName} <span className="muted">{bucketCounts[bucketName]}</span>
          </button>
        ))}
      </div>
      <div className="memory-controls">
        <input
          className="text-input"
          list="memory-tags"
          placeholder="filter by tag…"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        />
        <datalist id="memory-tags">
          {tagCounts.map(({ tag }) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
        <select
          value={sortOrder}
          onChange={(event) =>
            setSortOrder(event.target.value === "strongest" ? "strongest" : "newest")
          }
        >
          <option value="newest">newest</option>
          <option value="strongest">strongest</option>
        </select>
        {tagFilter && <button onClick={() => setTagFilter("")}>clear</button>}
      </div>
      {memories.length === 0 && <EmptyNote>No memories match.</EmptyNote>}
      <ul className="memory-list">
        {memories.map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            isBucketShown={bucket === null}
            onTagClick={setTagFilter}
          />
        ))}
      </ul>
    </div>
  );
}
