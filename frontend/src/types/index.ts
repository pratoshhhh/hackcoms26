export type HydrantState = "CLEAR" | "POSSIBLY_BLOCKED" | "BLOCKED" | "OFFLINE";

export interface Hydrant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state: HydrantState;
  state_since: string;
  is_simulated: boolean;
  last_seen_at: string | null;
}

export interface WsEvent<T = unknown> {
  type: string;
  ts: string;
  data: T;
}
