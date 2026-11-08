import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Alert,
  AlertKind,
  DeliveryRecord,
  Filters,
  Hydrant,
  HydrantStatus,
  Incident,
  LocationSource,
  MaintenanceTask,
  NotificationSubscription,
  ObstructionType,
  TaskStatus,
} from "@/types";
import { computeRisk, loadHydrants, riskLevelOf } from "@/services/hydrantService";
import { dispatch } from "@/services/notificationService";
import { readingAt } from "@/services/telemetryService";
import { simulatedSignature, taskFromIncident, verify } from "@/services/maintenanceService";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";
import { addressLine, pickDetail } from "@/data/obstructions";
import { uid } from "@/lib/utils";

export const DEFAULT_FILTERS: Filters = {
  statuses: ["clear", "warning", "blocked", "offline"],
  obstructionTypes: [],
  riskLevels: [],
  updatedWithinMin: null,
  includeUnmonitored: true,
};

export interface FocusRequest {
  lng: number;
  lat: number;
  zoom?: number;
  nonce: number;
}

interface State {
  loadState: "idle" | "loading" | "ready" | "error";
  loadWarning?: string;
  locationSource?: LocationSource;
  fetchedAt?: number;

  hydrants: Record<string, Hydrant>;
  hydrantIds: string[];
  incidents: Incident[];
  alerts: Alert[];
  deliveries: DeliveryRecord[];
  subscriptions: NotificationSubscription[];
  tasks: MaintenanceTask[];

  now: number;
  selectedId: string | null;
  focus: FocusRequest | null;
  flashIncidentId: string | null;

  filters: Filters;
  heatmap: boolean;
  satellite: boolean;
  buildings3d: boolean;

  sidebarCollapsed: boolean;
  demoPanelOpen: boolean;
  copilotOpen: boolean;
  subscribeFor: string | null | "area";
  online: boolean;
}

interface Actions {
  init(forceRefresh?: boolean): Promise<void>;
  tick(): void;
  setOnline(v: boolean): void;

  select(id: string | null, opts?: { fly?: boolean }): void;
  focusOn(lng: number, lat: number, zoom?: number): void;
  setFilters(patch: Partial<Filters>): void;
  resetFilters(): void;
  toggle(key: "heatmap" | "satellite" | "buildings3d" | "sidebarCollapsed" | "demoPanelOpen" | "copilotOpen"): void;
  set<K extends keyof State>(key: K, value: State[K]): void;

  simulateObstruction(id: string, type: ObstructionType, severity?: "warning" | "critical"): void;
  clearObstruction(id: string, note?: string): void;
  setOffline(id: string): void;
  restoreDevice(id: string): void;
  reportObstruction(id: string, type: ObstructionType, note: string): void;

  markAlertsRead(ids?: string[]): void;
  addSubscription(sub: Omit<NotificationSubscription, "id" | "createdAt">): NotificationSubscription;
  removeSubscription(id: string): void;
  clearDeliveries(): void;

  createTask(hydrantId: string): MaintenanceTask | null;
  claimTask(id: string, name: string): void;
  setTaskQr(id: string): void;
  setTaskPhoto(id: string, which: "beforePhoto" | "afterPhoto", url: string | undefined): void;
  submitEvidence(id: string): void;
  runVerification(id: string): void;
  reviewTask(id: string, approve: boolean): void;
}

export type AppStore = State & Actions;

const at_ = (h: Hydrant) => addressLine(h);
const what = (h: Hydrant, t?: ObstructionType | null) => h.obstructionDetail ?? (t ? OBSTRUCTION_LABELS[t] : "Obstruction");

const ALERT_COPY: Record<AlertKind, (h: Hydrant, t?: ObstructionType | null) => { title: string; body: string }> = {
  blocked: (h, t) => ({ title: `${h.id} blocked · ${at_(h)}`, body: `${what(h, t)}. Sensor confirms the hydrant is blocked.` }),
  warning: (h, t) => ({ title: `${h.id} possible obstruction · ${at_(h)}`, body: `${what(h, t)}. Waiting for the sensor to confirm.` }),
  cleared: (h) => ({ title: `${h.id} accessible again`, body: `Sensor reads clear space in front of the hydrant at ${at_(h)}.` }),
  offline: (h) => ({ title: `${h.id} sensor offline`, body: `No readings from ${at_(h)}. Accessibility unknown until it reconnects.` }),
  restored: (h) => ({ title: `${h.id} sensor back online`, body: `Readings resumed at ${at_(h)}.` }),
  report: (h, t) => ({ title: `Community report · ${h.id}`, body: `${what(h, t)} at ${at_(h)}.` }),
};

export const useApp = create<AppStore>()(
  persist(
    (set, get) => {
      /** Push an alert, fan out simulated deliveries, return it. */
      const raise = (kind: AlertKind, h: Hydrant, incidentId?: string, t?: ObstructionType | null): Alert => {
        const copy = ALERT_COPY[kind](h, t);
        const alert: Alert = { id: uid("ALR"), kind, hydrantId: h.id, incidentId, ...copy, createdAt: Date.now(), read: false };
        const deliveries = dispatch(alert, h, get().subscriptions);
        set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 200), deliveries: [...deliveries, ...s.deliveries].slice(0, 500) }));
        return alert;
      };

      /** Update one hydrant's status and recompute its risk. */
      const patchHydrant = (id: string, patch: Partial<Hydrant>, incidents: Incident[]) => {
        const s = get();
        const prev = s.hydrants[id];
        const next: Hydrant = { ...prev, ...patch };
        next.riskScore = computeRisk(next, incidents, Date.now());
        next.riskLevel = riskLevelOf(next.riskScore);
        return { ...s.hydrants, [id]: next };
      };

      const closeActive = (incidents: Incident[], id: string, kind: Incident["kind"], at: number) =>
        incidents.map((i) => (i.hydrantId === id && i.kind === kind && i.status === "active" ? { ...i, status: "resolved" as const, resolvedAt: at } : i));

      const pushTimeline = (t: MaintenanceTask, status: TaskStatus, note?: string): MaintenanceTask => ({
        ...t,
        status,
        timeline: [...t.timeline, { status, at: Date.now(), note }],
      });

      const updateTask = (id: string, fn: (t: MaintenanceTask) => MaintenanceTask) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }));

      return {
        loadState: "idle",
        hydrants: {},
        hydrantIds: [],
        incidents: [],
        alerts: [],
        deliveries: [],
        subscriptions: [],
        tasks: [],
        now: Date.now(),
        selectedId: null,
        focus: null,
        flashIncidentId: null,
        filters: DEFAULT_FILTERS,
        heatmap: false,
        satellite: false,
        buildings3d: false,
        sidebarCollapsed: false,
        demoPanelOpen: false,
        copilotOpen: false,
        subscribeFor: null,
        online: typeof navigator === "undefined" ? true : navigator.onLine,

        async init(forceRefresh) {
          if (get().loadState === "loading") return;
          set({ loadState: "loading" });
          try {
            const res = await loadHydrants({ forceRefresh });
            const hydrants: Record<string, Hydrant> = {};
            res.hydrants.forEach((h) => (hydrants[h.id] = h));
            const now = Date.now();
            const tasks = res.incidents
              .filter((i) => i.status === "active" && i.kind === "obstruction")
              .map((i) => taskFromIncident(i, hydrants[i.hydrantId], now));
            set({
              loadState: "ready",
              loadWarning: res.warning,
              locationSource: res.source,
              fetchedAt: res.fetchedAt,
              hydrants,
              hydrantIds: res.hydrants.map((h) => h.id),
              incidents: res.incidents,
              tasks,
              selectedId: null,
              now,
            });
          } catch (e) {
            set({ loadState: "error", loadWarning: (e as Error).message });
          }
        },

        tick: () => set({ now: Date.now() }),
        setOnline: (online) => set({ online }),

        select(id, opts) {
          set({ selectedId: id });
          const h = id ? get().hydrants[id] : null;
          if (h && opts?.fly !== false) get().focusOn(h.lng, h.lat, 16.5);
        },
        focusOn: (lng, lat, zoom) => set({ focus: { lng, lat, zoom, nonce: Date.now() } }),
        setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
        resetFilters: () => set({ filters: DEFAULT_FILTERS }),
        toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<State>),
        set: (key, value) => set({ [key]: value } as Partial<State>),

        simulateObstruction(id, type, severity = "critical") {
          const s = get();
          const h = s.hydrants[id];
          if (!h || !h.monitored) return; // no sensor, nothing to detect
          const at = Date.now();
          let incidents = closeActive(s.incidents, id, "device", at);
          const existing = incidents.find((i) => i.hydrantId === id && i.kind === "obstruction" && i.status === "active");
          let incident: Incident;
          const detail = existing?.obstructionType === type && existing.detail ? existing.detail : pickDetail(type, id, at);
          if (existing) {
            // Escalate / re-type the open incident instead of creating a duplicate.
            incident = { ...existing, obstructionType: type, severity, detail };
            incidents = incidents.map((i) => (i.id === existing.id ? incident : i));
          } else {
            incident = { id: uid("INC"), hydrantId: id, kind: "obstruction", obstructionType: type, severity, status: "active", startedAt: at, origin: "demo", detail };
            incidents = [...incidents, incident];
          }
          const status: HydrantStatus = severity === "critical" ? "blocked" : "warning";
          const hydrants = patchHydrant(id, { status, obstructionType: type, obstructionDetail: detail, statusSince: h.status === status ? h.statusSince : at }, incidents);
          let tasks = s.tasks;
          if (!tasks.some((t) => t.incidentId === incident.id)) tasks = [taskFromIncident(incident, hydrants[id], at), ...tasks];
          set({ incidents, hydrants, tasks, flashIncidentId: incident.id, now: at });
          raise(status === "blocked" ? "blocked" : "warning", hydrants[id], incident.id, type);
        },

        clearObstruction(id, note) {
          const s = get();
          const h = s.hydrants[id];
          if (!h || (h.status !== "blocked" && h.status !== "warning")) return;
          const at = Date.now();
          const open = s.incidents.find((i) => i.hydrantId === id && i.kind === "obstruction" && i.status === "active");
          const incidents = closeActive(s.incidents, id, "obstruction", at);
          const hydrants = patchHydrant(id, { status: "clear", obstructionType: null, obstructionDetail: null, statusSince: at }, incidents);
          const tasks = s.tasks.map((t) =>
            t.incidentId === open?.id && !["approved", "rejected"].includes(t.status)
              ? { ...t, timeline: [...t.timeline, { status: t.status, at, note: note ?? "Sensor reports clear" }] }
              : t,
          );
          set({ incidents, hydrants, tasks, now: at });
          raise("cleared", hydrants[id], open?.id);
        },

        setOffline(id) {
          const s = get();
          const h = s.hydrants[id];
          if (!h || !h.monitored || h.status === "offline") return;
          const at = Date.now();
          const incident: Incident = { id: uid("INC"), hydrantId: id, kind: "device", obstructionType: null, severity: "warning", status: "active", startedAt: at, origin: "demo" };
          const incidents = [...s.incidents, incident];
          const hydrants = patchHydrant(id, { status: "offline", statusSince: at }, incidents);
          set({ incidents, hydrants, now: at });
          raise("offline", hydrants[id], incident.id);
        },

        restoreDevice(id) {
          const s = get();
          const h = s.hydrants[id];
          if (!h) return;
          const at = Date.now();
          const incidents = closeActive(s.incidents, id, "device", at);
          const obstruction = incidents.find((i) => i.hydrantId === id && i.kind === "obstruction" && i.status === "active");
          const status: HydrantStatus = obstruction ? (obstruction.severity === "critical" ? "blocked" : "warning") : "clear";
          const hydrants = patchHydrant(id, { status, monitored: true, uptimePct: h.uptimePct || 97.5, statusSince: at }, incidents);
          set({ incidents, hydrants, now: at });
          raise("restored", hydrants[id]);
        },

        reportObstruction(id, type, note) {
          const s = get();
          const h = s.hydrants[id];
          if (!h) return;
          const at = Date.now();
          const detail = note.trim() || pickDetail(type, id, at);
          const incident: Incident = { id: uid("INC"), hydrantId: id, kind: "obstruction", obstructionType: type, severity: "warning", status: "active", startedAt: at, origin: "report", note, detail };
          // A citizen report raises a warning; the sensor (or a reviewer) confirms a block.
          const already = s.incidents.some((i) => i.hydrantId === id && i.kind === "obstruction" && i.status === "active");
          const incidents = already ? s.incidents : [...s.incidents, incident];
          const hydrants = already || h.status === "offline" ? s.hydrants : patchHydrant(id, { status: "warning", obstructionType: type, obstructionDetail: detail, statusSince: at }, incidents);
          set({ incidents, hydrants, now: at });
          raise("report", { ...hydrants[id], obstructionDetail: detail }, incident.id, type);
        },

        markAlertsRead: (ids) => set((s) => ({ alerts: s.alerts.map((a) => (!ids || ids.includes(a.id) ? { ...a, read: true } : a)) })),
        addSubscription(sub) {
          const full: NotificationSubscription = { ...sub, id: uid("SUB"), createdAt: Date.now() };
          set((s) => ({ subscriptions: [full, ...s.subscriptions] }));
          return full;
        },
        removeSubscription: (id) => set((s) => ({ subscriptions: s.subscriptions.filter((x) => x.id !== id) })),
        clearDeliveries: () => set({ deliveries: [] }),

        createTask(hydrantId) {
          const s = get();
          const inc = s.incidents.find((i) => i.hydrantId === hydrantId && i.kind === "obstruction" && i.status === "active");
          if (!inc) return null;
          const existing = s.tasks.find((t) => t.incidentId === inc.id);
          if (existing) return existing;
          const task = taskFromIncident(inc, s.hydrants[hydrantId], Date.now());
          set({ tasks: [task, ...s.tasks] });
          return task;
        },
        claimTask: (id, name) => updateTask(id, (t) => ({ ...pushTimeline(t, "claimed", `Claimed by ${name}`), claimedBy: name })),
        setTaskQr: (id) => updateTask(id, (t) => ({ ...t, qrVerified: true, timeline: [...t.timeline, { status: t.status, at: Date.now(), note: "QR code scanned on site" }] })),
        setTaskPhoto: (id, which, url) => updateTask(id, (t) => ({ ...t, [which]: url, verification: undefined })),
        submitEvidence: (id) => updateTask(id, (t) => pushTimeline(t, "evidence", "Before and after photos submitted")),
        runVerification(id) {
          updateTask(id, (t) => pushTimeline(t, "verifying", "Verification started (simulated)"));
          setTimeout(() => {
            const s = get();
            const t = s.tasks.find((x) => x.id === id);
            if (!t) return;
            const h = s.hydrants[t.hydrantId];
            const r = readingAt(h, s.incidents, Date.now());
            const result = verify(t, h, r.distanceCm, Date.now());
            updateTask(id, (tt) => ({ ...pushTimeline(tt, "review", `Recommendation: ${result.state.replace("_", " ")}`), verification: result }));
          }, 1400);
        },
        reviewTask(id, approve) {
          if (!approve) {
            updateTask(id, (t) => ({ ...pushTimeline(t, "rejected", "Rejected by reviewer"), reward: { status: "none" } }));
            return;
          }
          updateTask(id, (t) => ({ ...pushTimeline(t, "approved", "Approved by reviewer"), reward: { status: "pending" } }));
          setTimeout(() => {
            updateTask(id, (t) => ({ ...t, reward: { status: "simulated", signature: simulatedSignature(t.id) } }));
          }, 1600);
        },
      };
    },
    {
      name: "hh:app:v1",
      partialize: (s) => ({ subscriptions: s.subscriptions, deliveries: s.deliveries, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);

// ---- selectors ----
export const useHydrantList = () => {
  const ids = useApp((s) => s.hydrantIds);
  const map = useApp((s) => s.hydrants);
  return useMemo(() => ids.map((id) => map[id]), [ids, map]);
};
export const useSelected = () => useApp((s) => (s.selectedId ? s.hydrants[s.selectedId] : null));
export const useUnread = () => useApp((s) => s.alerts.reduce((n, a) => n + (a.read ? 0 : 1), 0));
export const useActiveIncidents = () => {
  const incidents = useApp((s) => s.incidents);
  return useMemo(() => incidents.filter((i) => i.status === "active"), [incidents]);
};
