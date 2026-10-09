from pydantic import BaseModel, ConfigDict, Field


class SprintSummaryRecord(BaseModel):
    """One row of the sprint summary. Serialized with the same column names
    the summary DataFrame uses (e.g. "In Sampling Pool")."""

    model_config = ConfigDict(populate_by_name=True)

    sprint: str = Field(alias="Sprint")
    items_resolved: int = Field(alias="Items Resolved")
    story_points: int = Field(alias="Story Points")
    last_resolved_date: str = Field(alias="Last Resolved Date")
    recency_rank: int = Field(alias="Recency Rank")
    in_sampling_pool: bool = Field(alias="In Sampling Pool")


class SimulationParams(BaseModel):
    """The original Data Input form fields, kept as raw strings (exactly as
    submitted) so /api/simulate parses them the same way the form did."""

    model_config = ConfigDict(coerce_numbers_to_str=True)

    target_type: str | None = None
    target_value: str | None = None
    num_simulations: str | None = None
    skip_validation: bool = False
    exclude_latest_sprints: str | None = None
    sprint_start_date: str | None = None
    sprint_length: str | None = None
    team_capacity_factor: str | None = None


class ValidateResponse(BaseModel):
    summary: list[SprintSummaryRecord]
    params: SimulationParams


class SimulateRequest(BaseModel):
    summary: list[SprintSummaryRecord]
    params: SimulationParams


class ResultRow(BaseModel):
    confidence: int
    label: str
    sprints: int
    exceeds_window: bool
    completion_date: str | None


class Histogram(BaseModel):
    labels: list[str]
    counts: list[int]


class SimulateResponse(BaseModel):
    target_type: str
    target_value: int
    rows: list[ResultRow]
    histogram: Histogram


class ErrorResponse(BaseModel):
    errors: list[str]


class HealthResponse(BaseModel):
    status: str
