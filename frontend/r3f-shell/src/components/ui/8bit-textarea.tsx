import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";

// Retro "8-bit" textarea: the base shadcn Textarea stripped of its rounding/border, wrapped in a
// hard double-rule frame. Matches the look established by ./8bit-chart-area-step.tsx -- sharp
// corners + thick `border-foreground` (violet `--ring` in dark) rather than a pixel font, so there
// is no offline font dependency. `font="retro"` is the default and, as in the chart, is a marker
// class (no @font-face backs it) -- kept for API parity with the source component.
export const inputVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

export interface BitTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof inputVariants> {
  asChild?: boolean;
}

function Textarea({ className, font, ...props }: BitTextareaProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <ShadcnTextarea
        {...props}
        className={cn(
          "rounded-none border-0 shadow-none ring-0 transition-transform focus-visible:bg-background",
          font !== "normal" && "retro",
        )}
      />
      {/* Hard double-rule frame. NOTE: arbitrary `[6px]` widths -- Tailwind's border-width scale is
          0/2/4/8, so a bare `border-y-6` generates NO class and the frame renders invisible. */}
      <div
        className="pointer-events-none absolute inset-0 -my-1.5 border-y-[6px] border-foreground dark:border-ring"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 -mx-1.5 border-x-[6px] border-foreground dark:border-ring"
        aria-hidden="true"
      />
    </div>
  );
}

export { Textarea };
export default Textarea;
