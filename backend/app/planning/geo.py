import math

EARTH_RADIUS_KM = 6371.0

Point = tuple[float, float]  # (latitude, longitude)


def haversine_km(a: Point, b: Point) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def road_km(a: Point, b: Point, road_factor: float) -> float:
    """Straight-line distance stretched by a typical road-network detour factor."""
    return haversine_km(a, b) * road_factor


def path_km(points: list[Point], road_factor: float) -> float:
    return sum(road_km(a, b, road_factor) for a, b in zip(points, points[1:]))
