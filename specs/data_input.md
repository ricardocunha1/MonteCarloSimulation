# Planning Hub — Monte Carlo - Data Input

This document describes the data input requirements for the Monte Carlo sub-application of the Planning Hub.

## Data Source

The Monte Carlo entry page (`/monte-carlo`) lets users choose where the historical sprint data comes from:

- **Load from Azure DevOps**: not available yet. The option is shown but disabled, with a "Coming soon" badge.
- **Import an Excel file**: opens a file-selection modal with a file input that accepts `.xlsx` files only. "Continue" requires a file whose name ends in `.xlsx` (case-insensitive); otherwise the modal stays open and shows "Select an .xlsx file." inline. Cancel, Esc or a click outside the modal closes it without changing anything. The file is not read in the browser; its content is validated by the server when the form is submitted. After a file is chosen, the user goes to the input form at `/monte-carlo/input`, described below.

The chosen source is kept in memory only (a page reload returns to the selection page). Choosing a new source discards any previous validation or simulation results.

The "How to Use" help is available on this page and notes that loading from Azure DevOps is coming soon.

## Data Source Card

The input form has no file input. A Data Source card at the top of the form shows the selected source:

- **Excel file**: the selected file name.
- **Azure DevOps** (once available): the Project, Area Path and Iteration Path.

A "Change" link on the card returns to the selection page (`/monte-carlo`). Opening the form without a chosen data source redirects to the selection page.

## Input Parameters

The following table outlines the expected input parameters for the simulation:

| Parameter                            | Type               | Description                                                                                     | Is Mandatory | Default Value    |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- | ------------ | ---------------- |
| Sprint History Data                  | File (Excel)       | An Excel extract with historical sprint data. Chosen in the Data Source modal, not on the form. | Yes          | None             |
| Target Type                          | String (Dropdown)  | A choice between "Items Resolved" or "Story Points" to determine the metric for the simulation. | Yes          | "Items Resolved" |
| Target Value                         | Numeric            | A numeric input for the target to be completed.                                                 | Yes          | None             |
| Number of Simulations                | Numeric            | A numeric input for the number of Monte Carlo simulations to run.                               | Yes          | 10000            |
| Skip Historical Sprint Validation    | Boolean (Checkbox) | An option to skip the historical sprint validation step.                                        | No           | False            |
| Exclude Latest Sprints from Sampling | Numeric            | A numeric input to specify the number of latest sprints to exclude from sampling.               | No           | 0                |
| Sprint Start Date                    | Date               | A date input to specify the start date of the first sprint of the simulation                    | Yes          | None             |
| Sprint Length                        | Numeric            | A numeric input to specify the length of each sprint in business days.                          | Yes          | 10               |
| Team Capacity Factor                 | Numeric            | A numeric input to specify the team capacity factor for the simulation. Two decimal places.     | No           | 1.0              |

When rendering the fields in the screen, please order them by placing the mandatory fields first.
