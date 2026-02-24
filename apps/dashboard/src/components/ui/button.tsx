import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-lg text-sm font-medium',
    'transition-all duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
    'disabled:pointer-events-none disabled:opacity-40',
    'active:scale-[0.98] active:translate-y-[1px]',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-emerald-600 text-zinc-50',
          'hover:bg-emerald-500',
          'shadow-sm shadow-emerald-900/20',
        ].join(' '),
        destructive: [
          'bg-red-600/90 text-zinc-50',
          'hover:bg-red-500',
        ].join(' '),
        outline: [
          'border border-zinc-700 bg-transparent text-zinc-300',
          'hover:bg-zinc-800 hover:text-zinc-100 hover:border-zinc-600',
        ].join(' '),
        secondary: [
          'bg-zinc-800 text-zinc-300',
          'hover:bg-zinc-700 hover:text-zinc-100',
        ].join(' '),
        ghost: [
          'text-zinc-400',
          'hover:bg-zinc-800/50 hover:text-zinc-200',
        ].join(' '),
        link: 'text-emerald-400 underline-offset-4 hover:underline hover:text-emerald-300',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 rounded-md px-2.5 text-xs',
        lg: 'h-11 rounded-lg px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
