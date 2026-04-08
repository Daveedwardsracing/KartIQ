from typing import Any, Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    name: str
    email: str
    role: str
    driver_id: str | None = None
    user_account_id: str | None = None
    permissions: dict[str, bool] = Field(default_factory=dict)
    assigned_driver_ids: list[str] = Field(default_factory=list)
    must_change_password: bool = False
    account_status: str = "approved"


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirmRequest(BaseModel):
    token: str
    password: str


class PasswordChangeRequest(BaseModel):
    email: str
    current_password: str
    password: str


class PasswordResetResponse(BaseModel):
    ok: bool = True
    message: str
    reset_token: str | None = None
    expires_at: str | None = None


class RegisterRequest(BaseModel):
    name: str
    email: str
    role: Literal["driver", "parent", "manager"]
    linked_driver_id: str = ""
    assigned_driver_ids: list[str] = Field(default_factory=list)


class RegistrationResponse(BaseModel):
    ok: bool = True
    message: str


class DriverReport(BaseModel):
    driver_name: str
    format_label: str
    overall_summary: str
    strengths: list[str]
    weaknesses: list[str]
    action_points: list[str]
    confidence_rating: str
    raw_model_output: dict[str, Any] | None = None


class FeedbackRequest(BaseModel):
    audience: Literal["coach", "driver", "parent"]
    provider: Literal["openai", "ollama"] = "openai"
    model: str
    api_key: str | None = None
    analysis: dict[str, Any]
    user_account_id: str = ""
    email: str = ""
    role: str = ""
    test_session_id: str = ""
    use_retrieval: bool = True
    use_memory: bool = True


class FeedbackResponse(BaseModel):
    reports: list[DriverReport]


class SeedOverview(BaseModel):
    drivers: list[str]
    events: list[str]


class DriverCreateRequest(BaseModel):
    name: str
    number: str = ""
    class_name: str = ""
    aliases: list[str] = Field(default_factory=list)
    email: str = ""
    password: str = ""


class EventCreateRequest(BaseModel):
    venue: str
    name: str
    session_type: str
    start_date: str = ""
    end_date: str = ""
    driver_ids: list[str] = Field(default_factory=list)


class KartSetupRequest(BaseModel):
    front_sprocket: str = ""
    rear_sprocket: str = ""
    carb_jet: str = ""
    axle_length: str = ""
    axle_type: str = ""
    tyre_type: str = ""
    front_tyre_pressure: float | None = None
    rear_tyre_pressure: float | None = None
    torsion_bar_type: str = ""
    caster_type: str = ""
    ride_height: str = ""


class TestSessionCreateRequest(BaseModel):
    name: str
    venue: str
    session_type: str
    date: str = ""
    start_time: str = ""
    end_time: str = ""
    event_id: str = ""
    status: Literal["planned", "setup_complete", "uploaded", "analysed", "reviewed"] = "planned"
    weather: str = ""
    track_condition: str = ""
    tyre_condition: str = ""
    mechanic_notes: str = ""
    coach_notes: str = ""
    driver_ids: list[str] = Field(default_factory=list)
    driver_setups: dict[str, KartSetupRequest] = Field(default_factory=dict)


class AccessLevelRequest(BaseModel):
    name: str
    permissions: dict[str, bool] = Field(default_factory=dict)


class UserAccountRequest(BaseModel):
    name: str
    email: str
    password: str = ""
    role: Literal["admin", "manager", "driver", "parent"]
    access_level_id: str = ""
    linked_driver_id: str = ""
    assigned_driver_ids: list[str] = Field(default_factory=list)
    status: Literal["pending", "approved", "rejected"] = "approved"
    must_change_password: bool = False


class AppSettingsRequest(BaseModel):
    user_account_id: str = ""
    email: str = ""
    role: str = ""
    settings: dict[str, Any] = Field(default_factory=dict)


class EmailSettingsRequest(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class EmailSettingsTestRequest(BaseModel):
    to_email: str


class AccountActionRequest(BaseModel):
    actor_email: str = ""


class SessionStatusRequest(BaseModel):
    status: Literal["planned", "uploaded", "analysed", "reviewed", "shared"]


class ReportPublishRequest(BaseModel):
    status: Literal["draft", "reviewed", "published"] = "draft"
    visible_to_driver: bool = False
    visible_to_parent: bool = False
    review_note: str = ""


class TrackCornerDefinition(BaseModel):
    name: str
    sequence: int
    section_type: str = ""
    note: str = ""
    sector_name: str = ""
    start_pct: float | None = None
    end_pct: float | None = None
    apex_pct: float | None = None


class TrackUpdateRequest(BaseModel):
    layout_notes: str = ""
    coaching_focus: list[str] = Field(default_factory=list)
    corner_notes: list[str] = Field(default_factory=list)
    setup_notes: list[dict[str, str]] = Field(default_factory=list)
    preferred_setup_baseline: dict[str, Any] = Field(default_factory=dict)
    corner_marker_offsets: dict[str, float] = Field(default_factory=dict)
    corner_definitions: list[TrackCornerDefinition] = Field(default_factory=list)


class ChatMessageRequest(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    provider: Literal["openai", "ollama"] = "ollama"
    model: str
    api_key: str | None = None
    messages: list[ChatMessageRequest] = Field(default_factory=list)
    user_account_id: str = ""
    email: str = ""
    role: str = ""
    session_id: str = ""
    test_session_id: str = ""
    selected_event_id: str = ""
    current_screen: str = ""
    use_retrieval: bool = True
    use_memory: bool = True


class ChatResponse(BaseModel):
    reply: str
    retrieved_items: int = 0
    memory_items: int = 0


class AiMemoryRequest(BaseModel):
    user_account_id: str = ""
    email: str = ""
    role: str = ""
    title: str = ""
    content: str
    tags: list[str] = Field(default_factory=list)
    pinned: bool = False


class AiMemoryResponse(BaseModel):
    id: str
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)
    pinned: bool = False
    created_at: str
    updated_at: str


class SessionPresetRequest(BaseModel):
    name: str
    preset: dict[str, Any] = Field(default_factory=dict)


class CoachingNoteRequest(BaseModel):
    driver_id: str = ""
    title: str = ""
    body: str = ""
    next_actions: list[str] = Field(default_factory=list)


class BackupCreateResponse(BaseModel):
    file_name: str
    path: str
    size_bytes: int
    created_at: str
