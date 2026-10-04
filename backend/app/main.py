import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .realtime import manager
from .routers import analytics, assistant, auth, live, parcels, payments, planning, stats, tracking, users, vehicles
from .simulator import simulator


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Lets sync endpoints (which run in worker threads) push live updates onto this loop
    manager.bind_loop(asyncio.get_running_loop())
    yield
    await simulator.stop()


app = FastAPI(
    title="FleetFlow API",
    description="Parcel delivery and fleet management platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(vehicles.router)
app.include_router(parcels.router)
app.include_router(payments.router)
app.include_router(tracking.router)
app.include_router(stats.router)
app.include_router(analytics.router)
app.include_router(live.router)
app.include_router(planning.router)
app.include_router(assistant.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
