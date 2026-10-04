"""EV charging schedule as a linear program (OR-Tools GLOP).

Decision variables: p[i, t] = charging power (kW) of vehicle i in time slot t.

    minimize    sum_i,t  price[t] * p[i, t] * dt              (energy cost)
              + PENALTY * sum_i shortfall[i]                  (only if a target is impossible)
    subject to  0 <= p[i, t] <= charger_kw                    (charger rating)
                sum_i p[i, t] <= site_kw              for all t  (shared grid connection)
                E0[i] + eff * dt * sum_t p[i, t] <= capacity[i]
                E0[i] + eff * dt * sum_t p[i, t] + shortfall[i] >= target[i]
                shortfall[i] >= 0

It's the one-shot version of a model-predictive controller: in production you'd re-solve it every
slot with fresh battery readings and only apply the first step.

The baseline is "plug in and charge at full power straight away", limited by the same site cap.
"""

from dataclasses import dataclass
from datetime import datetime

from ortools.linear_solver import pywraplp

EFFICIENCY = 0.92  # charger and battery losses: grid energy in -> battery energy stored
SHORTFALL_PENALTY = 1_000_000  # cents per missing kWh; large enough to only bite when infeasible


@dataclass
class EV:
    vehicle_id: int
    capacity_kwh: float
    energy_kwh: float  # in the battery now
    target_kwh: float  # needed by departure


@dataclass
class Slot:
    start: datetime
    price_cents: float  # per kWh


@dataclass
class EVSchedule:
    vehicle_id: int
    power_kw: list[float]  # one value per slot
    final_kwh: float
    shortfall_kwh: float
    grid_kwh: float
    cost_cents: float


@dataclass
class ChargingResult:
    schedules: list[EVSchedule]
    baseline_power_kw: list[list[float]]  # [vehicle][slot]
    cost_cents: float
    baseline_cost_cents: float


def plan_charging(evs: list[EV], slots: list[Slot], slot_hours: float, charger_kw: float, site_kw: float) -> ChargingResult:
    solver = pywraplp.Solver.CreateSolver("GLOP")
    n = len(slots)
    power = [[solver.NumVar(0, charger_kw, f"p_{i}_{t}") for t in range(n)] for i in range(len(evs))]
    shortfall = [solver.NumVar(0, solver.infinity(), f"short_{i}") for i in range(len(evs))]

    for t in range(n):
        solver.Add(sum(power[i][t] for i in range(len(evs))) <= site_kw)
    for i, ev in enumerate(evs):
        stored = ev.energy_kwh + EFFICIENCY * slot_hours * sum(power[i])
        solver.Add(stored <= ev.capacity_kwh)
        solver.Add(stored + shortfall[i] >= min(ev.target_kwh, ev.capacity_kwh))

    solver.Minimize(
        sum(slots[t].price_cents * slot_hours * power[i][t] for i in range(len(evs)) for t in range(n))
        + SHORTFALL_PENALTY * sum(shortfall)
    )
    if solver.Solve() != pywraplp.Solver.OPTIMAL:
        raise RuntimeError("The charging problem could not be solved")

    schedules = []
    for i, ev in enumerate(evs):
        kw = [max(0.0, round(power[i][t].solution_value(), 3)) for t in range(n)]
        grid = sum(kw) * slot_hours
        schedules.append(EVSchedule(
            vehicle_id=ev.vehicle_id,
            power_kw=kw,
            final_kwh=ev.energy_kwh + EFFICIENCY * grid,
            shortfall_kwh=round(shortfall[i].solution_value(), 3),
            grid_kwh=grid,
            cost_cents=sum(slots[t].price_cents * slot_hours * kw[t] for t in range(n)),
        ))

    baseline = charge_immediately(evs, n, slot_hours, charger_kw, site_kw)
    baseline_cost = sum(slots[t].price_cents * slot_hours * row[t] for row in baseline for t in range(n))
    return ChargingResult(
        schedules=schedules,
        baseline_power_kw=baseline,
        cost_cents=sum(s.cost_cents for s in schedules),
        baseline_cost_cents=baseline_cost,
    )


def charge_immediately(evs: list[EV], n_slots: int, slot_hours: float, charger_kw: float, site_kw: float) -> list[list[float]]:
    """What happens without planning: every van charges flat out from now until it reaches its target."""
    needed = [max(0.0, min(ev.target_kwh, ev.capacity_kwh) - ev.energy_kwh) / EFFICIENCY for ev in evs]  # grid kWh
    power = [[0.0] * n_slots for _ in evs]
    for t in range(n_slots):
        available = site_kw
        for i in range(len(evs)):
            kw = min(charger_kw, needed[i] / slot_hours, available)
            if kw <= 0:
                continue
            power[i][t] = kw
            needed[i] -= kw * slot_hours
            available -= kw
    return power
