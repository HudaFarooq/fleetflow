"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { Fragment, useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import { MAP_CENTER, TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";
import type { PlannedRoute } from "@/lib/types";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function startIcon(plate: string, color: string) {
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px">
      <span style="width:22px;height:22px;border-radius:6px;background:#0b1020;border:3px solid ${color};box-shadow:0 2px 8px rgb(0 0 0/.3)"></span>
      <span style="background:#0b1020;color:white;font:600 11px/1 ui-monospace,monospace;padding:3px 5px;border-radius:5px;white-space:nowrap">${escapeHtml(plate)}</span>
    </div>`,
  });
}

function stopIcon(number: number, color: string, isNew: boolean) {
  // New assignments are drawn hollow, stops already on the vehicle solid
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);width:22px;height:22px;border-radius:9999px;display:grid;place-items:center;
      font:700 11px/1 system-ui,sans-serif;border:2px solid ${color};box-shadow:0 2px 6px rgb(0 0 0/.25);
      background:${isNew ? "white" : color};color:${isNew ? "#0f172a" : "white"}">${number}</div>`,
  });
}

function FitToRoutes({ routes }: { routes: PlannedRoute[] }) {
  const map = useMap();
  useEffect(() => {
    const points = routes.flatMap((route) => [route.start, ...route.stops]).map((p) => [p.latitude, p.longitude] as [number, number]);
    // No animation: an animated fit that outlives the map (e.g. a quick re-render) crashes Leaflet
    if (points.length) map.fitBounds(points, { padding: [40, 40], animate: false });
  }, [routes, map]);
  return null;
}

export default function RouteMap({ routes, colors }: { routes: PlannedRoute[]; colors: string[] }) {
  return (
    <MapContainer center={MAP_CENTER} zoom={12} scrollWheelZoom={false} className="h-full min-h-96 w-full">
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
      />
      <FitToRoutes routes={routes} />
      {routes.map((route, index) => {
        const color = colors[index % colors.length];
        const path = [route.start, ...route.stops].map((p) => [p.latitude, p.longitude] as [number, number]);
        return (
          <Fragment key={route.vehicle_id}>
            {/* White casing under each line keeps crossing routes readable */}
            <Polyline positions={path} pathOptions={{ color: "white", weight: 7, opacity: 0.9 }} />
            <Polyline positions={path} pathOptions={{ color, weight: 4, opacity: 0.95 }} />
            <Marker position={path[0]} icon={startIcon(route.plate_number, color)} />
            {route.stops.map((stop, stopIndex) => (
              <Marker key={stop.parcel_id} position={[stop.latitude, stop.longitude]} icon={stopIcon(stopIndex + 1, color, stop.new)}>
                <Tooltip direction="top" offset={[0, -12]}>
                  {route.plate_number} stop {stopIndex + 1}: {stop.tracking_id} ({stop.weight_kg} kg){stop.new ? " · new" : ""}
                </Tooltip>
              </Marker>
            ))}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
