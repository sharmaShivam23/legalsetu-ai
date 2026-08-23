import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200/80",
        brand: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100/80",
        success: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80",
        warning: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80",
        danger: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100/80",
        outline: "border-slate-300 text-slate-700 bg-white hover:bg-slate-50",
      },
    },
    defaultVariants: { 
      variant: "default" 
    },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
