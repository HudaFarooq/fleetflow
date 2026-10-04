"""Capacitated vehicle routing with OR-Tools.

Problem: each vehicle starts where it is now and visits a set of delivery points. Parcels already
on (or assigned to) a vehicle must stay with it; waiting parcels may go to any vehicle. Respect
each vehicle's weight capacity and, for EVs, the distance its battery allows. Minimize total
distance. Routes are open: a vehicle ends at its last delivery rather than returning.

Modelling notes:
- Open routes use a shared dummy end node that's free to reach from anywhere.
- Every stop is optional with a drop penalty, so an impossible problem still returns the best
  partial plan (and tells you what didn't fit) instead of failing outright. Parcels already on
  a vehicle get a far larger penalty than waiting ones, so they're the last to be dropped.
"""

from dataclasses import dataclass, field

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from .geo import Point, path_km, road_km

WEIGHT_SCALE = 10  # the solver works in integers: 0.1 kg units
METRES = 1000
DROP_WAITING = 10_000_000  # metres-equivalent cost of leaving a waiting parcel unplanned
DROP_COMMITTED = 1_000_000_000


@dataclass
class Truck:
    vehicle_id: int
    position: Point
    capacity_kg: float
    max_km: float | None = None  # battery range for EVs; None means no limit


@dataclass
class Stop:
    parcel_id: int
    position: Point
    weight_kg: float
    vehicle_id: int | None = None  # set when the parcel is already committed to a vehicle


@dataclass
class Route:
    vehicle_id: int
    parcel_ids: list[int] = field(default_factory=list)
    distance_km: float = 0.0
    load_kg: float = 0.0


@dataclass
class RoutingResult:
    routes: list[Route]
    dropped: list[int]  # parcel ids that couldn't be planned
    solved: bool


def solve_routes(trucks: list[Truck], stops: list[Stop], road_factor: float, time_limit_s: int = 2) -> RoutingResult:
    if not trucks:
        return RoutingResult(routes=[], dropped=[s.parcel_id for s in stops], solved=True)

    n_trucks = len(trucks)
    end = n_trucks  # dummy end node
    points: list[Point] = [t.position for t in trucks] + [(0.0, 0.0)] + [s.position for s in stops]
    first_stop = n_trucks + 1

    manager = pywrapcp.RoutingIndexManager(len(points), n_trucks, list(range(n_trucks)), [end] * n_trucks)
    routing = pywrapcp.RoutingModel(manager)

    def distance(from_index: int, to_index: int) -> int:
        a, b = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
        if a == end or b == end:
            return 0
        return int(road_km(points[a], points[b], road_factor) * METRES)

    transit = routing.RegisterTransitCallback(distance)
    routing.SetArcCostEvaluatorOfAllVehicles(transit)

    # Battery range: cap the distance each vehicle may drive
    big = 10_000 * METRES
    routing.AddDimensionWithVehicleCapacity(
        transit, 0, [int(t.max_km * METRES) if t.max_km is not None else big for t in trucks], True, "Distance"
    )

    def demand(from_index: int) -> int:
        node = manager.IndexToNode(from_index)
        return int(round(stops[node - first_stop].weight_kg * WEIGHT_SCALE)) if node >= first_stop else 0

    routing.AddDimensionWithVehicleCapacity(
        routing.RegisterUnaryTransitCallback(demand), 0,
        [int(t.capacity_kg * WEIGHT_SCALE) for t in trucks], True, "Load",
    )

    truck_index = {t.vehicle_id: i for i, t in enumerate(trucks)}
    for offset, stop in enumerate(stops):
        index = manager.NodeToIndex(first_stop + offset)
        committed = stop.vehicle_id is not None and stop.vehicle_id in truck_index
        if committed:
            # Only this vehicle may deliver it (-1 = unperformed, still allowed via the disjunction).
            # Constraining VehicleVar directly; SetAllowedVehiclesForIndex's Python binding rejects lists in OR-Tools 9.15.
            routing.VehicleVar(index).SetValues([-1, truck_index[stop.vehicle_id]])
        routing.AddDisjunction([index], DROP_COMMITTED if committed else DROP_WAITING)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = time_limit_s
    solution = routing.SolveWithParameters(params)
    if solution is None:
        return RoutingResult(routes=[Route(t.vehicle_id) for t in trucks], dropped=[s.parcel_id for s in stops], solved=False)

    routes, visited = [], set()
    for v, truck in enumerate(trucks):
        route = Route(truck.vehicle_id)
        path: list[Point] = [truck.position]
        index = routing.Start(v)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node >= first_stop:
                stop = stops[node - first_stop]
                route.parcel_ids.append(stop.parcel_id)
                route.load_kg += stop.weight_kg
                path.append(stop.position)
                visited.add(stop.parcel_id)
            index = solution.Value(routing.NextVar(index))
        route.distance_km = path_km(path, road_factor)
        routes.append(route)

    dropped = [s.parcel_id for s in stops if s.parcel_id not in visited]
    return RoutingResult(routes=routes, dropped=dropped, solved=True)


def booking_order_km(truck: Truck, stops: list[Stop], road_factor: float) -> float:
    """Baseline for comparison: the same parcels, delivered in the order they were booked."""
    ordered = sorted(stops, key=lambda stop: stop.parcel_id)
    return path_km([truck.position] + [stop.position for stop in ordered], road_factor)
