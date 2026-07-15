# Monte Carlo Simulator - Simulation Execution

The execution must run according to the parameters and input sprint historical data, including the target type (Items Resolved or Story Points) selected by the user as an input parameter.
Generate data considering a max sprint window of 50.
After the execution, the application must present a summary of the simulation results for the selected target type only, including the following information:

- For each "confidence" level - P50 (typical), P70, P85 (recommended), P95 (worst case)
  - The number of required sprints to meet the target
  - Completion date of the last required sprint

Decide what is the best way to present these results. Consider using also charts to visualize the results, but ensure the information described above is visible and highlighted.

## Calendar view

Below the percentile summary cards and above the distribution/histogram
chart, show a calendar view spanning the date range from the Sprint Start
Date (Data Input) through the completion date of the furthest confidence
level that was actually reached within the 50-sprint window (normally P95;
falls back to the highest reached level — e.g. P85 — if P95 itself exceeds
the window). If no confidence level reaches the target within the window,
the calendar is omitted.

Each business day in that range is colored with the card color of the
percentile band it falls into: the P50 band runs from the Sprint Start Date
through the P50 completion date, the P70 band from the day after that
through the P70 completion date, and so on through P85/P95. When two
percentiles land on the same completion date, the lower percentile's color
wins for that day. Weekends (and any other non-business day) are never
colored — they render as muted/neutral cells, consistent with the
business-days-only completion-date math. The calendar is laid out as
traditional month grids (Monday–Sunday columns, one block per calendar
month), with a color legend for the percentiles shown.
