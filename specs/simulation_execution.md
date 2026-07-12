# Monte Carlo Simulator - Simulation Execution

The execution must run according to the parameters and input sprint historical data, including the target type (Items Resolved or Story Points) selected by the user as an input parameter.
Generate data considering a max sprint window of 50.
After the execution, the application must present a summary of the simulation results for the selected target type only, including the following information:

- For each "confidence" level - P50 (typical), P70, P85 (recommended), P95 (worst case)
  - The number of required sprints to meet the target
  - Completion date of the last required sprint

Decide what is the best way to present these results. Consider using also charts to visualize the results, but ensure the information described above is visible and highlighted.
