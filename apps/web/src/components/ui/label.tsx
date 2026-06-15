import { forwardRef, type LabelHTMLAttributes } from 'react';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, style, ...props }, ref) => {
    return (
      <label
        ref={ref}
        style={{
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          ...style,
        }}
        className={className}
        {...props}
      />
    );
  }
);

Label.displayName = 'Label';
