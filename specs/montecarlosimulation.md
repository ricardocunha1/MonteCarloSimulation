# Monte Carlo Simulator

This application simulates the number of sprints required to complete a target number of items or story points based on historical sprint data from Critical Manufacturing (CM) projects. The simulation uses a Monte Carlo method to generate random samples from the historical data and estimate the distribution of sprints needed to reach the specified target.

It should be divided into the following parts:

1. **Data Input**: A section where users can upload their historical sprint data and specify the parameters for the simulation.
2. **Data Validation**: An **optional** section that checks the uploaded data for consistency and completeness.
3. **Simulation Execution**: A section that runs the Monte Carlo simulation and presents the results.

## Technical architecture

The application will be built mainly using Python. It will be a single web application containing both the frontend and backend logic.

### Frontend

Languages and frameworks to be used:

- The frontend should be built using a web framework such as Flask, presenting a user-friendly interface for data input and displaying results.
- Use JavaScript libraries like D3.js or Plotly for interactive visualizations of the simulation results.
- Use Tailwind CSS for styling the frontend, ensuring a responsive and modern design.

Consider the following constraints when designing the frontend:

- Use the CM Logo (`assets/cmlogo.svg`) in the header of the application.
- Prefer a more dark themed design, with a dark background and light text for better readability.

Consider the color scheme:

| Hex Code | RGB Value         | Color Name |
| -------- | ----------------- | ---------- |
| #274B76  | rgb(39, 75, 118)  | Dark Blue  |
| #4E98D1  | rgb(78, 152, 209) | Light Blue |
| #60C5B5  | rgb(96, 197, 181) | Teal       |
| #EBC160  | rgb(235, 193, 96) | Gold       |
| #D8804B  | rgb(216, 128, 75) | Orange     |
| #B64234  | rgb(182, 66, 52)  | Red        |
| #802D6C  | rgb(128, 45, 108) | Purple     |

### Backend / Simulation logic

The backend logic will be implemented in Python, using libraries such as Pandas for data manipulation and NumPy for numerical computations.

## Simulation logic

For the different parts of the application, check their individual spec documents:

1. **Data Input**: [specs/data_input.md](specs/data_input.md)
2. **Data Validation**: [specs/data_validation.md](specs/data_validation.md)
3. **Simulation Execution**: [specs/simulation_execution.md](specs/simulation_execution.md)

## Validation

- [ ] Application is accessible via a web browser.
- [ ] Users are allowed to upload an Excel file containing historical sprint data and the rest of the input parameters.
- [ ] Run a simulation using the sample data under `notebook/Sprint_History.xlsx` and the following parameters:
  - Target Type: Items Resolved
  - Target Value: 5
  - Number of Simulations: 1000
  - Skip Historical Sprint Validation: False
  - Exclude Latest Sprints from Sampling: 1
  - Sprint Start Date: 2026-07-11
  - Sprint Length: 10 business days
- [ ] The simulation runs quickly (under 2 seconds) for 1000 simulations and under 5 seconds for 5000 simulations.
