import { L } from "../../lib/releasePlan/constants";
import type { LayoutBand } from "../../lib/releasePlan/layout";
import type { Epic, Feature } from "../../lib/releasePlan/types";
import { FeatureCard } from "./FeatureCard";

/**
 * One (feature column × band) cell; holds the card when the feature belongs to
 * the band. Phase 2 makes it a drop target.
 */
export function FeatureCell({
  epic,
  feature,
  x,
  layoutBand,
  onOpen,
}: {
  epic: Epic;
  feature: Feature;
  x: number;
  layoutBand: LayoutBand;
  onOpen: () => void;
}) {
  const { band, y, h } = layoutBand;
  return (
    <div
      className="abs cell fcell"
      data-epic={String(epic.id)}
      data-feature={String(feature.id)}
      style={{ left: x, top: y, width: L.COL_W, height: h, padding: `${L.BAND_PAD}px 0` }}
    >
      {(feature.milestoneId ?? null) === band.id && <FeatureCard feature={feature} onOpen={onOpen} />}
    </div>
  );
}
