# Monte Carlo Simulator - Data Validation

In this section, the application must validate the input parameters entered by the user and present a summary of the historical sprint data set.

## Validations

Ensure that the input parameters are valid:

- The Excel file worksheet meets the criteria specified in the "Sprint Historical Data Format" section below.
- The number of selected simulations do not exceed 20000.
- The target value is a positive number.
- The sprint length is a positive number.
- The sprint start date is a valid date.

In case any of these fail, the application should display an error message indicating the specific issue and prompt the user to correct it.

### Sprint Historical Data

The Excel file must contain one worksheet with the following columns:

| Column Name    | Data Type | Description                                                 | Is Mandatory |
| -------------- | --------- | ----------------------------------------------------------- | ------------ |
| Work Item Type | String    | The type of work item (e.g., User Story, Bug)               | No           |
| ID             | Numeric   | The unique identifier for the work item                     | No           |
| State          | String    | The current state of the work item (e.g., Resolved, Closed) | Yes          |
| Iteration Path | String    | The iteration path of the work item                         | Yes          |
| Resolved Date  | Date      | The date when the work item was resolved                    | Yes          |
| Story Points   | Numeric   | The number of story points associated with the work item    | Yes          |
| Activated Date | Date      | The date when the work item was activated                   | No           |
| Created Date   | Date      | The date when the work item was created                     | No           |
| PICategory     | String    | The category of the work item                               | No           |

If Story Points are not provided, the application should assume a default value of 0.

## Summary

After every parameter is validated, the application should present a summary of the historical sprint data set.
Example:

| Sprint    | Items Resolved | Story Points | Last Resolved Date | Recency Rank | In Sampling Pool? |
| --------- | -------------- | ------------ | ------------------ | ------------ | ----------------- |
| Sprint 01 | 10             | 20           | 2023-01-15         | 3            | Yes               |
| Sprint 02 | 15             | 30           | 2023-01-29         | 2            | Yes               |
| Sprint 03 | 12             | 25           | 2023-02-12         | 1            | No                |

(...)

The user must be able to confirm the summary and proceed to the simulation execution.
