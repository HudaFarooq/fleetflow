"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { API_URL } from "./api";
import { useAuth } from "./auth";
import type { Vehicle } from "./types";

type LiveMessage =
  | { type: "hello"; simulation: boolean }
  | { type: "simulation"; running: boolean }
  | { type: "vehicle"; vehicle: Vehicle }
  | { type: "parcel"; parcel_id: number; status: string };

/**
 * Keeps a WebSocket open to the API and applies its updates to the cached queries,
 * so maps and tables change the moment something happens. Reconnects with backoff.
 */
export function useFleetLive(enabled = true) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [simulation, setSimulation] = useState(false);

  useEffect(() => {
    if (!token || !enabled) return;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      const current = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws/fleet`);
      socket = current;
      // The token goes in the first message, never the URL, so it stays out of server logs
      current.onopen = () => current.send(JSON.stringify({ token }));
      current.onmessage = (event) => {
        const message = JSON.parse(event.data) as LiveMessage;
        if (message.type === "hello") {
          attempt = 0;
          setConnected(true);
          setSimulation(message.simulation);
        } else if (message.type === "simulation") setSimulation(message.running);
        else if (message.type === "vehicle") {
          let known = false;
          queryClient.setQueryData<Vehicle[]>(["vehicles", token], (vehicles) =>
            vehicles?.map((vehicle) => {
              if (vehicle.id !== message.vehicle.id) return vehicle;
              known = true;
              return message.vehicle;
            }),
          );
          if (!known) queryClient.invalidateQueries({ queryKey: ["vehicles"] });
        } else if (message.type === "parcel") {
          queryClient.invalidateQueries({ queryKey: ["parcels"] });
          queryClient.invalidateQueries({ queryKey: ["analytics"] });
        }
      };
      current.onclose = () => {
        setConnected(false);
        if (stopped) return;
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15_000));
        attempt += 1;
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [token, enabled, queryClient]);

  return { connected, simulation };
}
