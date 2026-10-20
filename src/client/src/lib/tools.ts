import type { ComponentType } from "react";
import { DiceIcon } from "../components/icons/DiceIcon";
import { RoadmapIcon } from "../components/icons/RoadmapIcon";

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

/** A category of tools, rendered as one sidebar group and one home page section. */
export interface HubToolGroup {
  /** Stable key, also used for element ids. */
  id: string;
  /** Group heading shown in the sidebar and on the home page. */
  label: string;
  tools: readonly HubTool[];
}

/** Estimation tools hosted by the hub. Adding a tool is one entry in a group (plus its routes in App.tsx). */
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

/** Planning tools hosted by the hub. */
export const PLANNING_TOOLS: readonly HubTool[] = [
  {
    id: "release-plan",
    name: "Release Plan",
    path: "/release-plan",
    description: "Plan Feature releases on an interactive drag-and-drop board.",
    goal: "Decide which Features ship in which release or sprint, per Epic.",
    icon: RoadmapIcon,
  },
];

/** Tool groups in display order (sidebar and home page). */
export const TOOL_GROUPS: readonly HubToolGroup[] = [
  { id: "estimations", label: "Estimations", tools: ESTIMATION_TOOLS },
  { id: "planning", label: "Planning", tools: PLANNING_TOOLS },
];

/** Product name used in the header, document titles and the home page. */
export const HUB_NAME = "CM Estimations Hub";
