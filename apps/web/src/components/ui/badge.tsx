import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-primary-foreground)',
    border: 'none',
  },
  secondary: {
    backgroundColor: 'var(--color-surface-alt)',
    color: 'var(--color-text-primary)',
    border: 'none',
  },
  destructive: {
    backgroundColor: 'var(--color-danger)',
    color: 'var(--color-primary-foreground)',
    border: 'none',
  },
  outline: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  },
};

function Badge({ className, variant = 'default', style, ...props }: BadgeProps) {
  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '9999px',
    padding: '2px 10px',
    fontSize: '12px',
    fontWeight: 600,
    transition: 'colors 150ms ease',
    ...variantStyles[variant],
    ...style,
  };

  return <div style={badgeStyle} className={className} {...props} />;
}

export { Badge };
