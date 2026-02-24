import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-sm text-[13px] font-medium',
    'transition-colors duration-100',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-35',
    'cursor-pointer',
    '[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-foreground text-background hover:bg-foreground/90',
        destructive: 'bg-status-error/90 text-white hover:bg-status-error',
        outline: 'border border-border/60 bg-transparent text-foreground-2 hover:bg-secondary hover:text-foreground',
        secondary: 'bg-secondary text-foreground-2 hover:bg-accent hover:text-foreground',
        ghost: 'text-foreground-3 hover:bg-secondary hover:text-foreground-2',
        link: 'text-foreground-2 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-6 px-2 text-[11px]',
        lg: 'h-9 px-4',
        icon: 'h-8 w-8',
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
