"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import { MAP_CENTER, TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";
import type { Vehicle } from "@/lib/types";
import { VEHICLE_STATUS, VEHICLE_TYPE } from "@/lib/utils";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// Reusing the same icon object lets Leaflet move the existing marker (and animate it)
// instead of rebuilding it on every position update.
const iconCache = new Map<string, L.DivIcon>();

function vehicleIcon(vehicle: Vehicle) {
  const key = `${vehicle.plate_number}|${vehicle.status}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const color = VEHICLE_STATUS[vehicle.status].color;
  // Leaflet markers are plain HTML strings, so user-entered text must be escaped
  const icon = L.divIcon({
    className: "vehicle-marker",
    iconSize: [0, 0],
    html: `
      <div style="position:relative;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px">
        <span style="position:absolute;top:0;width:28px;height:28px;border-radius:9999px;background:${color};opacity:.35;animation:pulse-ring 2s infinite"></span>
        <span style="position:relative;width:28px;height:28px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 4px 12px rgb(0 0 0/.3)"></span>
        <span style="background:#0b1020;color:white;font:600 11px/1 ui-monospace,monospace;padding:4px 6px;border-radius:6px;white-space:nowrap">${escapeHtml(vehicle.plate_number)}</span>
      </div>`,
  });
  iconCache.set(key, icon);
  return icon;
}

function FitToVehicles({ points, ids }: { points: [number, number][]; ids: number[] }) {
  const map = useMap();
  // Fit once per set of vehicles, not on every live position update
  const key = ids.join(",");
  useEffect(() => {
    // No animation: an animated fit that outlives the map (e.g. a quick re-render) crashes Leaflet
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    else if (points.length > 1) map.fitBounds(points, { padding: [50, 50], animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function FleetMap({ vehicles }: { vehicles: Vehicle[] }) {
  const located = useMemo(
    () => vehicles.filter((vehicle) => vehicle.latitude !== null && vehicle.longitude !== null),
    [vehicles],
  );
  const points = located.map((vehicle) => [vehicle.latitude!, vehicle.longitude!] as [number, number]);

  return (
    <MapContainer center={points[0] ?? MAP_CENTER} zoom={12} scrollWheelZoom={false} className="h-full min-h-80 w-full">
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
      />
      <FitToVehicles points={points} ids={located.map((vehicle) => vehicle.id)} />
      {located.map((vehicle) => (
        <Marker key={vehicle.id} position={[vehicle.latitude!, vehicle.longitude!]} icon={vehicleIcon(vehicle)}>
          <Popup>
            <strong>{vehicle.plate_number}</strong>
            <br />
            {VEHICLE_TYPE[vehicle.type]} · {VEHICLE_STATUS[vehicle.status].label}
            {vehicle.battery_level !== null && (
              <>
                <br />
                Battery {Math.round(vehicle.battery_level)}%
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
