import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-xs uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 border",
  {
    variants: {
      variant: {
        default:
          "border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 hover:border-primary term-glow",
        destructive:
          "border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:border-destructive",
        accent:
          "border-accent/60 bg-accent/15 text-accent hover:bg-accent/25 hover:border-accent term-glow-amber",
        outline:
          "border-border bg-transparent text-foreground hover:border-primary/50 hover:text-primary",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:text-primary hover:border-primary/30",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 px-2.5 text-[11px]",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
