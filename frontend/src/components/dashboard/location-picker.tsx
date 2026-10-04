"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

import { MAP_CENTER, TILE_ATTRIBUTION, TILE_URL } from "@/lib/map";

const PIN = L.divIcon({
  className: "",
  iconSize: [0, 0],
  html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
    <span style="width:26px;height:26px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#10b981;border:3px solid white;box-shadow:0 3px 10px rgb(0 0 0/.3)"></span>
  </div>`,
});

type Point = { latitude: number; longitude: number };

function ClickToPlace({ onChange }: { onChange: (point: Point) => void }) {
  useMapEvents({ click: (event) => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return null;
}

/** Click (or drag the pin) to choose a delivery point. */
export default function LocationPicker({ value, onChange }: { value: Point | null; onChange: (point: Point) => void }) {
  return (
    <MapContainer center={value ? [value.latitude, value.longitude] : MAP_CENTER} zoom={12} className="h-full w-full">
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
      <ClickToPlace onChange={onChange} />
      {value && (
        <Marker
          position={[value.latitude, value.longitude]}
          icon={PIN}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = (event.target as L.Marker).getLatLng();
              onChange({ latitude: lat, longitude: lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
