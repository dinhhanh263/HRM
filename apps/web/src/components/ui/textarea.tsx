import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-20 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-all duration-150',
          'placeholder:text-text-muted',
          'focus:border-primary focus:ring-2 focus:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-border',
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
