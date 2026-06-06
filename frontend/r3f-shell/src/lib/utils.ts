import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// cn() -- the shadcn class-merge helper every generated component imports from "@/lib/utils".
// clsx flattens conditional/array/object class inputs into one string; twMerge then resolves
// Tailwind conflicts so the LAST utility wins (e.g. cn("p-2","p-4") -> "p-4", not "p-2 p-4").
// Without twMerge, conflicting utilities both emit and the cascade order (not call order) decides.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
