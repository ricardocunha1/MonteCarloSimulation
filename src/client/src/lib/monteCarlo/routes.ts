/** Route paths of the Monte Carlo flow (registered in `App.tsx`). */
export const MONTE_CARLO_ROUTES = {
  /** Data source choice, the tool's entry page. */
  dataSource: "/monte-carlo",
  /** Simulation parameters form for the chosen data source. */
  input: "/monte-carlo/input",
  confirm: "/monte-carlo/confirm",
  results: "/monte-carlo/results",
} as const;
