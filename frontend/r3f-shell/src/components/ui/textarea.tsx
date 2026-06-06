import * as React from "react";

import { cn } from "@/lib/utils";

// Base shadcn Textarea -- the multi-line sibling of ./input.tsx, kept deliberately identical in
// styling (same border/bg/text/shadow/focus tokens) so inputs and textareas read as one family.
// It exists primarily because ./8bit-textarea.tsx decorates it; it is also usable on its own.
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-input dark:border-input/50 bg-background px-3 py-2 text-sm text-foreground shadow-sm shadow-black/5 transition-shadow placeholder:text-muted-foreground/70 focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
