import { useState } from "react";
import type { Hydrant, ObstructionType } from "@/types";
import { useApp } from "@/stores/appStore";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button, Label, Textarea } from "@/components/ui/primitives";
import { OBSTRUCTION_LABELS } from "@/services/analyticsService";
import { cn } from "@/lib/utils";

export function ReportDialog({ hydrant, open, onOpenChange }: { hydrant: Hydrant; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [type, setType] = useState<ObstructionType>("snow");
  const [note, setNote] = useState("");
  const report = useApp((s) => s.reportObstruction);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Report obstruction · ${hydrant.id}`} description="A report raises a possible-obstruction warning. The sensor or a reviewer confirms a block.">
        <div className="space-y-4 px-4 py-4">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-text-2">What's blocking it?</legend>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(OBSTRUCTION_LABELS) as ObstructionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className={cn("h-8 rounded border px-3 text-sm", type === t ? "border-accent bg-accent/10" : "border-line text-text-2 hover:bg-surface-2")}
                >
                  {OBSTRUCTION_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="report-note">Details (optional)</Label>
            <Textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Plow bank about 1 m high on the street side" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              report(hydrant.id, type, note);
              setNote("");
              onOpenChange(false);
            }}
          >
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
