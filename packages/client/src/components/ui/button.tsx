import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      default: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
      outline: "border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50",
      ghost: "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
    },
    size: { default: "h-10 px-4 py-2", sm: "h-9 px-3", icon: "h-9 w-9" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />);
Button.displayName = "Button";
export { Button, buttonVariants };