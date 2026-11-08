import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 grid place-items-center bg-text-1/20 p-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
      <DialogPrimitive.Content
        className={cn(
          "flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-line bg-surface-1 shadow-float duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div>
            <DialogPrimitive.Title className="text-md font-semibold text-text-1">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-text-2">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text-1" aria-label="Close">
            <X className="size-4" strokeWidth={1.5} />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{children}</div>;
}
