import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { L } from "../../lib/releasePlan/constants";
import { featureTooltip, isDone } from "../../lib/releasePlan/selectors";
import type { Feature } from "../../lib/releasePlan/types";
import { SizeBadge } from "./SizeBadge";
import { StateMark } from "./StateMark";

/** Appended to the card tooltip (drag-and-drop phase). */
export const SELECT_TOOLTIP_SUFFIX = " · Ctrl+click to select several features of this Epic";

/**
 * Purple Feature card. Draggable; a click goes to `onClick` (the board decides
 * between Ctrl/⌘+click selection and opening the details), Enter/Space open the
 * details. A selected card shows a gold outline and a ✓ badge.
 */
export function FeatureCard({
  feature,
  onOpen,
  onClick,
  onDragStart,
  onDragEnd,
  selected = false,
  dragging = false,
}: {
  feature: Feature;
  /** Opens the details (Enter/Space). */
  onOpen: () => void;
  /** Mouse click; the board's `cardClick` handles Ctrl/⌘ selection vs. opening. */
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  /** In the Ctrl/⌘+click selection (`.selected`, gold outline + ✓). */
  selected?: boolean;
  /** Being dragged (`.dragging`). */
  dragging?: boolean;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  const className = `card feature fcard${isDone(feature) ? " done" : ""}${selected ? " selected" : ""}${dragging ? " dragging" : ""}`;
  return (
    <div
      className={className}
      data-feature={String(feature.id)}
      role="button"
      tabIndex={0}
      title={featureTooltip(feature) + SELECT_TOOLTIP_SUFFIX}
      style={{ height: L.CARD_H }}
      draggable
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="id">
        <span>
          <StateMark state={feature.state} />
          {`Feature #${feature.id}`}
        </span>
        <SizeBadge size={feature.size} />
      </div>
      <div className="t">{feature.title}</div>
      <span className="chk" aria-hidden="true">
        ✓
      </span>
    </div>
  );
}
