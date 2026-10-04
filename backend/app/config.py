from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-secret-change-me-in-your-env-file"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "production" turns on safety checks at startup
    environment: str = "development"
    # Public demo: the seeded demo accounts can be used but not changed, deleted or locked
    demo_mode: bool = False

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/fleetflow"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    cors_origins: list[str] = ["http://localhost:3000"]
    # Used to build links in emails (password reset, receipts)
    frontend_url: str = "http://localhost:3000"

    # Login protection: this many wrong passwords locks that email for the lockout period
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
    password_reset_minutes: int = 30

    # Email: "console" prints emails to the server log; "resend" sends real ones (free tier)
    email_backend: str = "console"
    resend_api_key: str | None = None
    email_from: str = "FleetFlow <onboarding@resend.dev>"

    # Payments: "sandbox" is a built-in test provider, no account or real money needed
    payment_provider: str = "sandbox"
    currency: str = "USD"
    price_base_cents: int = 300  # flat fee per parcel
    price_per_kg_cents: int = 50

    # Route planning. Distances are straight-line x a road factor, since we don't run a
    # road-network router; good enough to compare plans, not for turn-by-turn navigation.
    road_factor: float = 1.3
    route_solver_seconds: int = 2

    # EV charging planner
    ev_battery_kwh: float = 60.0
    ev_kwh_per_km: float = 0.25
    ev_reserve_pct: float = 20.0  # never plan to arrive below this
    ev_departure_pct: float = 80.0  # standard morning charge, so vans can take unplanned jobs
    charger_kw: float = 11.0  # per vehicle
    site_limit_kw: float = 22.0  # the depot's grid connection, shared by all chargers
    # Time-of-use tariff in cents per kWh, by local hour at the depot
    depot_timezone: str = "UTC"  # e.g. "Asia/Karachi", "Europe/London"
    tariff_offpeak_cents: float = 12.0  # 22:00-07:00
    tariff_mid_cents: float = 20.0
    tariff_peak_cents: float = 35.0  # 17:00-21:00

    # AI assistant. Get a free key at https://aistudio.google.com; without one the assistant is off.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    # Cost guards: free tiers have quotas, and paid keys cost money per request
    assistant_per_user_per_hour: int = 20
    assistant_daily_cap: int = 200

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        # Hosting providers hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the driver named
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @model_validator(mode="after")
    def check_production(self) -> "Settings":
        if self.environment == "production":
            if self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("Set JWT_SECRET to a long random value in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("Use PostgreSQL in production; SQLite data is lost when the server restarts")
        return self


settings = Settings()
