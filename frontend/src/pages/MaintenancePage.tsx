import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { Camera, Check, CircleDashed, ExternalLink, ImagePlus, QrCode, ShieldCheck } from "lucide-react";
import { useApp } from "@/stores/appStore";
import type { MaintenanceTask, TaskStatus, VerificationResult } from "@/types";
import { Button, Input, Label, PageHeader } from "@/components/ui/primitives";
import { StatusChip } from "@/components/hydrants/status";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";
import { samplePhoto } from "@/services/maintenanceService";
import { duration, fmtDateTime, fmtTime } from "@/utils/format";
import { cn } from "@/lib/utils";
import { addressLine } from "@/data/obstructions";

const URGENCY: Record<MaintenanceTask["urgency"], { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "border-crit/30 bg-crit/10 text-crit" },
  priority: { label: "Priority", cls: "border-warn/30 bg-warn/10 text-warn" },
  routine: { label: "Routine", cls: "border-line text-text-2" },
};

const STEPS: { status: TaskStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "claimed", label: "Claimed" },
  { status: "evidence", label: "Evidence" },
  { status: "review", label: "Review" },
  { status: "approved", label: "Approved" },
];
const ORDER: TaskStatus[] = ["open", "claimed", "evidence", "verifying", "review", "approved"];

const VSTATE: Record<VerificationResult["state"], { label: string; cls: string }> = {
  pending_review: { label: "Pending review", cls: "text-text-2" },
  likely_cleared: { label: "Likely cleared", cls: "text-ok" },
  needs_inspection: { label: "Needs manual inspection", cls: "text-warn" },
  rejected: { label: "Rejected", cls: "text-crit" },
};

function Stepper({ task }: { task: MaintenanceTask }) {
  const idx = task.status === "rejected" ? -1 : ORDER.indexOf(task.status);
  return (
    <ol className="flex items-center gap-2" aria-label="Task progress">
      {STEPS.map((s, i) => {
        const stepIdx = ORDER.indexOf(s.status);
        const done = idx > stepIdx || task.status === "approved";
        const current = idx === stepIdx || (s.status === "review" && task.status === "verifying");
        return (
          <li key={s.status} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border text-2xs",
                done ? "border-ok bg-ok text-surface-1" : current ? "border-accent text-accent" : "border-line text-text-3",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={2.5} /> : i + 1}
            </span>
            <span className={cn("text-xs", current ? "text-text-1" : "text-text-3")}>{s.label}</span>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1", done ? "bg-ok" : "bg-line")} />}
          </li>
        );
      })}
    </ol>
  );
}

function PhotoSlot({ task, which }: { task: MaintenanceTask; which: "beforePhoto" | "afterPhoto" }) {
  const setPhoto = useApp((s) => s.setTaskPhoto);
  const input = useRef<HTMLInputElement>(null);
  const url = task[which];
  const label = which === "beforePhoto" ? "Before" : "After";
  const disabled = task.status === "open" || task.status === "approved" || task.status === "rejected";
  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-text-2">{label}</span>
        {url && !disabled && (
          <button className="text-2xs text-text-3 hover:text-text-1" onClick={() => setPhoto(task.id, which, undefined)}>
            Remove
          </button>
        )}
      </div>
      {url ? (
        <img src={url} alt={`${label} photo for ${task.hydrantId}`} className="aspect-[4/3] w-full rounded border border-line object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-line text-xs text-text-3">
          <ImagePlus className="size-5" strokeWidth={1.5} />
          No photo
          <div className="flex gap-1">
            <Button size="sm" disabled={disabled} onClick={() => input.current?.click()}>
              Upload
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setPhoto(task.id, which, samplePhoto(which === "beforePhoto" ? "before" : "after", OBSTRUCTION_LABELS[task.obstructionType]))}>
              Use sample
            </Button>
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPhoto(task.id, which, URL.createObjectURL(f));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Compare({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded border border-line">
        <img src={after} alt="After" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} alt="Before" className="absolute inset-0 size-full object-cover" />
        </div>
        <div className="absolute inset-y-0 w-px bg-text-1" style={{ left: `${pos}%` }} aria-hidden />
        <span className="absolute left-2 top-2 rounded bg-surface-1/90 px-1 text-2xs">Before</span>
        <span className="absolute right-2 top-2 rounded bg-surface-1/90 px-1 text-2xs">After</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--accent))]" aria-label="Compare before and after" />
    </div>
  );
}

function TaskDetail({ task }: { task: MaintenanceTask }) {
  const h = useApp((s) => s.hydrants[task.hydrantId]);
  const incidentDetail = useApp((s) => s.incidents.find((i) => i.id === task.incidentId)?.detail);
  const now = useApp((s) => s.now);
  const s = useApp.getState();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [scanning, setScanning] = useState(false);
  const v = task.verification;
  const canSubmit = task.status === "claimed" && task.beforePhoto && task.afterPhoto;

  useEffect(() => setScanning(false), [task.id]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="num text-lg font-medium">{task.id}</h2>
              <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-xs", URGENCY[task.urgency].cls)}>{URGENCY[task.urgency].label}</span>
            </div>
            <p className="mt-1 text-sm text-text-2">
              {OBSTRUCTION_LABELS[task.obstructionType]} at <span className="num">{task.hydrantId}</span> · {h ? addressLine(h) : ""}
            </p>
            {h && <p className="num mt-0.5 text-xs text-text-3">{h.lat.toFixed(6)}, {h.lng.toFixed(6)}</p>}
            {(h?.obstructionDetail ?? incidentDetail) && <p className="mt-2 text-sm text-text-1">{h?.obstructionDetail ?? incidentDetail}</p>}
          </div>
          <div className="text-right">
            <div className="num text-lg">{task.bountyUsdc} USDC</div>
            <div className="text-2xs text-text-3">Simulated bounty</div>
          </div>
        </div>
        <div className="mt-4">
          <Stepper task={task} />
        </div>
        {h && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-2">
            Sensor now: <StatusChip hydrant={h} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                s.select(h.id);
                navigate("/map");
              }}
            >
              View on map
            </Button>
          </div>
        )}
      </div>

      {/* 1. Claim */}
      {task.status === "open" && (
        <section className="border-b border-line px-6 py-4">
          <h3 className="text-base font-semibold">Claim this task</h3>
          <p className="mt-1 text-xs text-text-3">Volunteers clear the obstruction, scan the hydrant's QR tag, and submit before and after photos.</p>
          <form
            className="mt-3 flex max-w-md items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) s.claimTask(task.id, name.trim());
            }}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="vol-name">Volunteer name</Label>
              <Input id="vol-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan from Park Ave block club" />
            </div>
            <Button variant="primary" type="submit" disabled={!name.trim()}>
              Claim task
            </Button>
          </form>
        </section>
      )}

      {/* 2. On-site evidence */}
      {task.status !== "open" && (
        <section className="border-b border-line px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">On-site evidence</h3>
            {task.claimedBy && <span className="text-xs text-text-3">Claimed by {task.claimedBy}</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-line bg-surface-1 px-3 py-2">
            <QrCode className="size-5 text-text-2" strokeWidth={1.5} />
            <div className="min-w-0 flex-1 text-sm">
              {task.qrVerified ? (
                <span className="text-ok">QR tag matches {task.hydrantId}</span>
              ) : scanning ? (
                <span className="text-text-2">Camera preview placeholder. Point at the QR tag on the hydrant bonnet.</span>
              ) : (
                <span className="text-text-2">Scan the QR tag to confirm you're at {task.hydrantId}.</span>
              )}
            </div>
            {!task.qrVerified &&
              (scanning ? (
                <Button
                  size="sm"
                  onClick={() => {
                    s.setTaskQr(task.id);
                    setScanning(false);
                  }}
                >
                  Simulate successful scan
                </Button>
              ) : (
                <Button size="sm" onClick={() => setScanning(true)} disabled={task.status === "approved" || task.status === "rejected"}>
                  <Camera /> Scan QR code
                </Button>
              ))}
          </div>
          {scanning && !task.qrVerified && (
            <div className="mt-2 grid aspect-video max-w-sm place-items-center rounded border border-dashed border-line text-xs text-text-3">
              <div className="size-24 rounded border-2 border-accent/60" />
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <PhotoSlot task={task} which="beforePhoto" />
            <PhotoSlot task={task} which="afterPhoto" />
          </div>
          {task.beforePhoto && task.afterPhoto && (
            <div className="mt-4 max-w-lg">
              <span className="mb-1 block text-xs font-medium text-text-2">Side-by-side comparison</span>
              <Compare before={task.beforePhoto} after={task.afterPhoto} />
            </div>
          )}

          {h && (h.status === "blocked" || h.status === "warning") && task.status !== "approved" && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-line px-3 py-2 text-xs text-text-2">
              The sensor still reports an obstruction. Once the volunteer clears it, the sensor reading changes.
              <Button size="sm" onClick={() => s.clearObstruction(h.id, `Cleared by ${task.claimedBy ?? "volunteer"} (demo)`)}>
                <ShieldCheck /> Simulate clearing obstruction
              </Button>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            {task.status === "claimed" && (
              <Button
                variant="primary"
                disabled={!canSubmit}
                onClick={() => {
                  s.submitEvidence(task.id);
                  s.runVerification(task.id);
                }}
              >
                Submit evidence for verification
              </Button>
            )}
            {(task.status === "review" || task.status === "evidence") && (
              <Button onClick={() => s.runVerification(task.id)}>Re-run verification</Button>
            )}
          </div>
        </section>
      )}

      {/* 3. Verification */}
      {(task.status === "verifying" || v) && (
        <section className="border-b border-line px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Verification</h3>
            <span className="text-2xs text-text-3">Simulated evidence check · Gemini not connected</span>
          </div>
          {task.status === "verifying" ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-text-2" role="status">
              <CircleDashed className="size-4 animate-spin" strokeWidth={1.5} /> Checking evidence against the latest sensor reading…
            </p>
          ) : (
            v && (
              <div className="mt-3">
                <div className="flex items-baseline gap-3">
                  <span className={cn("text-md font-medium", VSTATE[v.state].cls)}>{VSTATE[v.state].label}</span>
                  {v.confidence > 0 && <span className="num text-xs text-text-3">confidence {(v.confidence * 100).toFixed(0)}%</span>}
                </div>
                <p className="mt-1 text-sm text-text-2">{v.summary}</p>
                <ul className="mt-3 divide-y divide-line rounded border border-line">
                  {v.checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-3 px-3 py-2 text-sm">
                      {c.passed ? <Check className="size-4 text-ok" strokeWidth={2} aria-label="Passed" /> : <span className="grid size-4 place-items-center text-crit" aria-label="Failed">×</span>}
                      <span className="flex-1">{c.label}</span>
                      <span className="num text-xs text-text-3">{c.detail}</span>
                    </li>
                  ))}
                </ul>
                {task.status === "review" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button variant="primary" disabled={v.state === "rejected" || v.state === "pending_review"} onClick={() => s.reviewTask(task.id, true)}>
                      Approve payout
                    </Button>
                    <Button variant="danger" onClick={() => s.reviewTask(task.id, false)}>
                      Reject claim
                    </Button>
                    <span className="text-xs text-text-3">A human reviewer always makes the final call.</span>
                  </div>
                )}
              </div>
            )
          )}
        </section>
      )}

      {/* 4. Reward */}
      {(task.status === "approved" || task.reward.status !== "none") && (
        <section className="border-b border-line px-6 py-4">
          <h3 className="text-base font-semibold">Reward</h3>
          <div className="mt-3 rounded border border-line bg-surface-1 px-3 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span>
                <span className="num">{task.bountyUsdc} USDC</span> to {task.claimedBy}
              </span>
              <span className={cn("text-xs", task.reward.status === "simulated" ? "text-ok" : "text-text-2")}>
                {task.reward.status === "pending" ? "Preparing transfer…" : "Simulated — not on-chain"}
              </span>
            </div>
            {task.reward.signature && (
              <div className="mt-2">
                <div className="text-2xs text-text-3">Placeholder signature</div>
                <div className="num break-all text-xs text-text-2">{task.reward.signature}</div>
                <span className="mt-1 inline-flex items-center gap-1 text-2xs text-text-3">
                  <ExternalLink className="size-3" /> Explorer link appears here once Solana Devnet is connected
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="px-6 py-4">
        <h3 className="text-base font-semibold">Activity</h3>
        <ol className="mt-3 space-y-2 border-l border-line pl-4">
          {[...task.timeline].reverse().map((e, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-surface-3 ring-2 ring-bg" />
              <span className="num mr-2 text-xs text-text-3">{e.at > now - 86400000 ? fmtTime(e.at) : fmtDateTime(e.at)}</span>
              {e.note ?? e.status}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function MaintenancePage() {
  const tasks = useApp((s) => s.tasks);
  const hydrants = useApp((s) => s.hydrants);
  const now = useApp((s) => s.now);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("open");

  const groups = useMemo(
    () => ({
      open: tasks.filter((t) => t.status === "open"),
      active: tasks.filter((t) => ["claimed", "evidence", "verifying", "review"].includes(t.status)),
      done: tasks.filter((t) => t.status === "approved" || t.status === "rejected"),
    }),
    [tasks],
  );
  const rank = { urgent: 0, priority: 1, routine: 2 };
  const list = [...groups[tab as keyof typeof groups]].sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.createdAt - b.createdAt);
  const selectedId = params.get("task");
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    const g = selected.status === "open" ? "open" : selected.status === "approved" || selected.status === "rejected" ? "done" : "active";
    setTab(g);
  }, [selected?.status, selected]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Community maintenance" description="Volunteer tasks for obstructed hydrants. Bounties and verification are simulated in this build." />
      <div className="flex min-h-0 flex-1">
        <aside className={cn("flex w-full shrink-0 flex-col border-r border-line md:w-80", selected && "hidden md:flex")}>
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List className="flex gap-4 border-b border-line px-4" aria-label="Task status">
              {[
                ["open", "Available", groups.open.length],
                ["active", "In progress", groups.active.length],
                ["done", "Completed", groups.done.length],
              ].map(([v, l, n]) => (
                <Tabs.Trigger key={v} value={v as string} className="-mb-px flex h-10 items-center gap-1 border-b-2 border-transparent text-sm text-text-2 data-[state=active]:border-accent data-[state=active]:text-text-1">
                  {l}
                  <span className="num text-2xs text-text-3">{n}</span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs.Root>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {list.length === 0 && (
              <li className="px-4 py-6 text-sm text-text-2">
                {tab === "open" ? "No available tasks. Simulate an obstruction from Demo controls to create one." : tab === "active" ? "Nothing in progress. Claim an available task." : "No completed tasks yet."}
              </li>
            )}
            {list.map((t) => {
              const h = hydrants[t.hydrantId];
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setParams({ task: t.id })}
                    className={cn("w-full px-4 py-3 text-left hover:bg-surface-2", selectedId === t.id && "bg-surface-2")}
                    aria-current={selectedId === t.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-sm">{t.hydrantId}</span>
                      <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-2xs", URGENCY[t.urgency].cls)}>{URGENCY[t.urgency].label}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-text-2">
                      {OBSTRUCTION_LABELS[t.obstructionType]} · {h ? addressLine(h) : ""}
                    </div>
                    <div className="mt-1 flex justify-between text-2xs text-text-3">
                      <span className="num">{t.bountyUsdc} USDC (sim)</span>
                      <span className="num">open {duration(now - t.createdAt)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        {selected ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <button className="border-b border-line px-6 py-2 text-left text-xs text-accent md:hidden" onClick={() => setParams({})}>
              ← All tasks
            </button>
            <TaskDetail task={selected} />
          </div>
        ) : (
          <div className="hidden flex-1 place-items-center text-sm text-text-2 md:grid">Select a task to see its details.</div>
        )}
      </div>
    </div>
  );
}
