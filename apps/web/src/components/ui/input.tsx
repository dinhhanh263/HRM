import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'h-10 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-all duration-150',
          'placeholder:text-text-muted',
          'focus:border-primary focus:ring-2 focus:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20'
            : 'border-border',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
