import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-1.5 py-px text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-status-ok/10 text-status-ok',
        secondary: 'bg-secondary text-foreground-3',
        destructive: 'bg-status-error/10 text-status-error',
        outline: 'border border-border/60 text-foreground-3',
        success: 'bg-status-ok/10 text-status-ok',
        warning: 'bg-status-warn/10 text-status-warn',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
