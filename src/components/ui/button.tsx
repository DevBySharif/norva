import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50", { variants: { variant: { default: "bg-primary text-primary-foreground hover:bg-primary/90", secondary: "bg-muted text-foreground hover:bg-muted/70", ghost: "hover:bg-muted", destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90", outline: "border bg-card hover:bg-muted" }, size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs", lg: "h-12 px-6" } }, defaultVariants: { variant: "default", size: "default" } });
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : "button"; return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />; });
Button.displayName = "Button";
export { buttonVariants };
