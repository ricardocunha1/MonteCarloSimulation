# Monte Carlo Simulator

A web application that forecasts how many sprints are needed to hit a
target (Items Resolved or Story Points), using a Monte Carlo simulation
driven by historical sprint data from Critical Manufacturing (CM) projects.

Instead of a single-point estimate, the app runs thousands of randomized
simulations sampled from a team's own historical sprint throughput and
reports a distribution of outcomes — e.g. "50% of simulations reach the
target within 4 sprints, 95% reach it within 8 sprints" — along with the
projected completion dates for each confidence level.

## How it works

The application is a three-step wizard:

### 1. Data Input

The user uploads an Excel file with historical sprint data and fills in the
simulation parameters:

| Parameter                            | Required | Description                                                                                                    |
| ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| Sprint History Data                  | Yes      | The Excel file with historical sprint data (see format below)                                                  |
| Target Type                          | Yes      | "Items Resolved" or "Story Points" — the metric the simulation forecasts against                               |
| Target Value                         | Yes      | The number of items/story points to reach                                                                      |
| Number of Simulations                | Yes      | How many Monte Carlo runs to perform (capped at 5000)                                                          |
| Skip Historical Sprint Validation    | No       | Bypasses step 2 and jumps straight to execution                                                                |
| Exclude Latest Sprints from Sampling | No       | Number of most recent sprints to leave out of the random sampling pool (e.g. to exclude an in-progress sprint) |
| Sprint Start Date                    | Yes      | Start date of the first simulated sprint                                                                       |
| Sprint Length                        | Yes      | Length of each sprint, in business days                                                                        |

### 2. Data Validation (optional)

Unless skipped, the app validates the uploaded file and parameters, then
summarizes the historical data it parsed — one row per sprint, showing
items resolved, story points, last resolved date, a recency rank, and
whether that sprint is included in the simulation's sampling pool. The user
reviews this summary and confirms before running the simulation.

### 3. Simulation Execution

The app runs the requested number of simulations, each one randomly
sampling from the historical sprint data (respecting the sampling-pool
exclusions from step 2) until the target is reached or a 50-sprint window
is exceeded. Results are presented per confidence level — P50, P70, P85,
and P95 — showing the number of sprints required and the projected
completion date (business days only), plus a histogram of the full
distribution of outcomes.

## Sprint History Excel file format

The uploaded file must contain one worksheet with these columns:

| Column Name        | Data Type | Mandatory | Notes                                                                                                   |
| ------------------ | --------- | --------- | ------------------------------------------------------------------------------------------------------- |
| **State**          | String    | **Yes**   | Only rows where State is `Resolved`, `Done`, or `Closed` (case-sensitive) count toward a sprint         |
| **Iteration Path** | String    | **Yes**   | The sprint is derived from the last segment after `\`, e.g. `Project\Release 1\Sprint 12` → `Sprint 12` |
| **Resolved Date**  | Date      | **Yes**   | Used to determine each sprint's most recent completion date and recency rank                            |
| **Story Points**   | Numeric   | **Yes**   | Defaults to 0 for rows where it's missing                                                               |
| Work Item Type     | String    | No        | Not used in the simulation                                                                              |
| ID                 | Numeric   | No        | Not used in the simulation                                                                              |
| Activated Date     | Date      | No        | Not used in the simulation                                                                              |
| Created Date       | Date      | No        | Not used in the simulation                                                                              |
| PICategory         | String    | No        | Not used in the simulation                                                                              |

If a mandatory column is missing, or the file can't be parsed as Excel, the
app reports the specific problem instead of failing silently.

## Running locally

```bash
source .venv/bin/activate
pip install -r requirements.txt

python run.py                # dev server, http://127.0.0.1:5000
# or
flask --app run run

pytest tests/                # run the test suite
```

See `CLAUDE.md` for architecture notes and `specs/` for the full functional
specification.
