import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { useApp } from "@/stores/appStore";
import type { AlertKind, Channel } from "@/types";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button, Checkbox, Input, Label, Select } from "@/components/ui/primitives";
import { useHydrantList } from "@/stores/appStore";
import { addressLine } from "@/data/obstructions";
import { ALERT_KIND_LABELS, isEmail, isPhone } from "@/services/notificationService";
import { cn } from "@/lib/utils";

const EVENTS: AlertKind[] = ["blocked", "warning", "cleared", "offline", "restored", "report"];
type ChannelChoice = "email" | "sms" | "both";

function Radio({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <RadioGroup.Item
      value={value}
      className="flex flex-1 flex-col items-start rounded border border-line px-3 py-2 text-left data-[state=checked]:border-accent data-[state=checked]:bg-accent/10 hover:bg-surface-2"
    >
      <span className="text-sm text-text-1">{label}</span>
      {hint && <span className="text-2xs text-text-3">{hint}</span>}
    </RadioGroup.Item>
  );
}

export function SubscribeDialog() {
  const target = useApp((s) => s.subscribeFor);
  const set = useApp((s) => s.set);
  const hydrant = useApp((s) => (target && target !== "area" ? s.hydrants[target] : null));
  const add = useApp((s) => s.addSubscription);
  const all = useHydrantList();
  const neighborhoods = [...all.reduce((m, h) => m.set(h.neighborhood, (m.get(h.neighborhood) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const [channel, setChannel] = useState<ChannelChoice>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [events, setEvents] = useState<AlertKind[]>(["blocked", "cleared", "offline"]);
  const [scopeType, setScopeType] = useState<"hydrant" | "area">("hydrant");
  const [area, setArea] = useState("Downtown");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (target === null) return;
    setTouched(false);
    if (hydrant) {
      setScopeType("hydrant");
      setArea(hydrant.neighborhood);
    } else setScopeType("area");
  }, [target, hydrant]);

  const wantsEmail = channel !== "sms";
  const wantsSms = channel !== "email";
  const emailErr = wantsEmail && !isEmail(email) ? "Enter a valid email address." : null;
  const phoneErr = wantsSms && !isPhone(phone) ? "Enter a phone number with area code, e.g. +1 585 555 0142." : null;
  const eventsErr = events.length === 0 ? "Choose at least one event." : null;
  const valid = !emailErr && !phoneErr && !eventsErr;

  const save = () => {
    setTouched(true);
    if (!valid) return;
    const channels: Channel[] = channel === "both" ? ["email", "sms"] : [channel];
    add({
      email: wantsEmail ? email.trim() : undefined,
      phone: wantsSms ? phone.trim() : undefined,
      channels,
      events,
      scope: scopeType === "hydrant" && hydrant ? { type: "hydrant", hydrantId: hydrant.id } : { type: "area", neighborhood: area },
    });
    toast.success("Alert preferences saved", {
      description: "Saved on this device. Delivery is simulated until the backend sends email and SMS.",
    });
    set("subscribeFor", null);
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && set("subscribeFor", null)}>
      <DialogContent title="Subscribe to alerts" description="Get notified when a hydrant's accessibility changes.">
        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <Label>Coverage</Label>
            <RadioGroup.Root value={scopeType} onValueChange={(v) => setScopeType(v as "hydrant" | "area")} className="flex gap-2">
              {hydrant && <Radio value="hydrant" label={`This hydrant`} hint={`${hydrant.id} · ${addressLine(hydrant)}`} />}
              <Radio value="area" label="Neighborhood" hint="Every hydrant in an area" />
            </RadioGroup.Root>
            {scopeType === "area" && (
              <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Neighborhood">
                {neighborhoods.map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} · {count} hydrants
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Deliver by</Label>
            <RadioGroup.Root value={channel} onValueChange={(v) => setChannel(v as ChannelChoice)} className="flex gap-2">
              <Radio value="email" label="Email" />
              <Radio value="sms" label="SMS" />
              <Radio value="both" label="Both" />
            </RadioGroup.Root>
          </div>

          {wantsEmail && (
            <div className="space-y-1">
              <Label htmlFor="sub-email">Email</Label>
              <Input id="sub-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@cityofrochester.gov" aria-invalid={touched && !!emailErr} />
              {touched && emailErr && <p className="text-xs text-crit">{emailErr}</p>}
            </div>
          )}
          {wantsSms && (
            <div className="space-y-1">
              <Label htmlFor="sub-phone">Mobile number</Label>
              <Input id="sub-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 585 555 0142" aria-invalid={touched && !!phoneErr} />
              {touched && phoneErr && <p className="text-xs text-crit">{phoneErr}</p>}
            </div>
          )}

          <fieldset className="space-y-1">
            <legend className="mb-1 text-xs font-medium text-text-2">Alert me when</legend>
            <div className="grid grid-cols-2 gap-1">
              {EVENTS.map((ev) => (
                <label key={ev} className="flex h-8 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-surface-2">
                  <Checkbox checked={events.includes(ev)} onCheckedChange={() => setEvents((e) => (e.includes(ev) ? e.filter((x) => x !== ev) : [...e, ev]))} />
                  {ALERT_KIND_LABELS[ev]}
                </label>
              ))}
            </div>
            {touched && eventsErr && <p className="text-xs text-crit">{eventsErr}</p>}
          </fieldset>

          <p className={cn("rounded border border-line bg-surface-1 px-3 py-2 text-xs text-text-2")}>
            Preferences are stored in this browser. No email or SMS is sent yet. Matching alerts appear in the delivery log as “Simulated — not sent”.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => set("subscribeFor", null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save alert preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
