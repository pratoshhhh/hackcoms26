import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Button ----------
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors duration-150 ease-std disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        primary: "bg-text-1 text-surface-1 shadow-raise hover:bg-text-1/85",
        secondary: "border border-line-strong bg-surface-1 text-text-1 shadow-raise hover:bg-surface-2",
        ghost: "text-text-2 hover:bg-surface-2 hover:text-text-1",
        danger: "border border-crit/30 bg-surface-1 text-crit shadow-raise hover:bg-crit/5",
      },
      size: {
        sm: "h-7 px-2 text-xs",
        md: "h-8 px-3 text-sm",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

// ---------- Input ----------
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-8 w-full rounded border border-line-strong bg-surface-1 px-3 text-sm text-text-1 placeholder:text-text-3 focus-visible:border-accent focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[72px] w-full rounded border border-line-strong bg-surface-1 px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus-visible:border-accent focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("h-8 w-full rounded border border-line-strong bg-surface-1 px-2 text-sm text-text-1 focus-visible:border-accent focus-visible:outline-none", className)}
    {...props}
  />
));
Select.displayName = "Select";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn("text-xs font-medium text-text-2", className)} {...props} />);
Label.displayName = "Label";

// ---------- Tooltip ----------
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ content, children, side = "bottom", kbd }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; kbd?: string }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[100] flex max-w-xs items-center gap-2 rounded bg-text-1 px-2 py-1 text-xs text-surface-1 shadow-float data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0"
        >
          {content}
          {kbd && <Kbd>{kbd}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("rounded border border-line-strong bg-surface-1 px-1 font-mono text-2xs text-text-2", className)}>{children}</kbd>;
}

// ---------- Switch ----------
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-surface-3 transition-colors data-[state=checked]:border-text-1 data-[state=checked]:bg-text-1",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block size-3 translate-x-0.5 rounded-full bg-surface-1 shadow-raise transition-transform duration-150 ease-std data-[state=checked]:translate-x-3" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

// ---------- Checkbox ----------
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "grid size-4 shrink-0 place-items-center rounded-[4px] border border-line-strong bg-surface-1 data-[state=checked]:border-text-1 data-[state=checked]:bg-text-1 data-[state=checked]:text-surface-1",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator>
      <Check className="size-3" strokeWidth={2.5} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

// ---------- Layout helpers ----------
export function Section({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-line px-4 py-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-text-1">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label/value row with mono, right-aligned value and dim unit. */
export function Stat({ label, value, unit, hint }: { label: React.ReactNode; value: React.ReactNode; unit?: string; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-text-2">{label}</dt>
      <dd className="text-right">
        <span className="num text-text-1">{value}</span>
        {unit && <span className="num ml-1 text-xs text-text-3">{unit}</span>}
        {hint && <div className="text-2xs text-text-3">{hint}</div>}
      </dd>
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-8 text-sm text-text-2">
      <p>{title}</p>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-text-1">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
