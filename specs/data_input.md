# Monte Carlo Simulator - Data Input

This document describes the data input requirements for the Monte Carlo Simulator application.

The following table outlines the expected input parameters for the simulation:

| Parameter                            | Type               | Description                                                                                     | Is Mandatory | Default Value    |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- | ------------ | ---------------- |
| Sprint History Data                  | File (Excel)       | An Excel file containing historical sprint data                                                 | Yes          | None             |
| Target Type                          | String (Dropdown)  | A choice between "Items Resolved" or "Story Points" to determine the metric for the simulation. | Yes          | "Items Resolved" |
| Target Value                         | Numeric            | A numeric input for the target to be completed.                                                 | Yes          | None             |
| Number of Simulations                | Numeric            | A numeric input for the number of Monte Carlo simulations to run.                               | Yes          | 1000             |
| Skip Historical Sprint Validation    | Boolean (Checkbox) | An option to skip the historical sprint validation step.                                        | No           | False            |
| Exclude Latest Sprints from Sampling | Numeric            | A numeric input to specify the number of latest sprints to exclude from sampling.               | No           | 0                |
| Sprint Start Date                    | Date               | A date input to specify the start date of the first sprint of the simulation                    | Yes          | None             |
| Sprint Length                        | Numeric            | A numeric input to specify the length of each sprint in business days.                          | Yes          | 10               |
