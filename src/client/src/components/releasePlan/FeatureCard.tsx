import type { KeyboardEvent } from "react";
import { L } from "../../lib/releasePlan/constants";
import { featureTooltip, isDone } from "../../lib/releasePlan/selectors";
import type { Feature } from "../../lib/releasePlan/types";
import { SizeBadge } from "./SizeBadge";
import { StateMark } from "./StateMark";

/** Purple Feature card; click (or Enter/Space) opens its details. Phase 2 adds drag-and-drop and selection. */
export function FeatureCard({ feature, onOpen }: { feature: Feature; onOpen: () => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      className={`card feature fcard${isDone(feature) ? " done" : ""}`}
      data-feature={String(feature.id)}
      role="button"
      tabIndex={0}
      title={featureTooltip(feature)}
      style={{ height: L.CARD_H }}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <div className="id">
        <span>
          <StateMark state={feature.state} />
          {`Feature #${feature.id}`}
        </span>
        <SizeBadge size={feature.size} />
      </div>
      <div className="t">{feature.title}</div>
    </div>
  );
}
