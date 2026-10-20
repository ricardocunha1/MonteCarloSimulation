import type { ComponentType } from "react";
import { DiceIcon } from "../components/icons/DiceIcon";

/** A sub-application of the CM Estimations Hub, shown in the sidebar and on the home page. */
export interface HubTool {
  /** Stable key, also used as the React list key. */
  id: string;
  /** Label shown in the sidebar and on the home page card. */
  name: string;
  /** Route of the tool's entry page; the tool owns every route below it. */
  path: string;
  /** One-line summary shown on the home page card. */
  description: string;
  /** What the tool helps you decide, shown as "Goal:" on the home page card. */
  goal: string;
  /** Inline SVG icon component (see `components/icons/`). */
  icon: ComponentType<{ className?: string }>;
}

/** Estimation tools hosted by the hub. Adding a tool is one entry here (plus its routes in App.tsx). */
export const ESTIMATION_TOOLS: readonly HubTool[] = [
  {
    id: "monte-carlo",
    name: "Monte Carlo",
    path: "/monte-carlo",
    description: "Simulates thousands of future sprints from your historical sprint data.",
    goal: "Forecast how many sprints are needed to hit an Items Resolved or Story Points target, with confidence levels.",
    icon: DiceIcon,
  },
];

/** Product name used in the header, document titles and the home page. */
export const HUB_NAME = "CM Estimations Hub";
