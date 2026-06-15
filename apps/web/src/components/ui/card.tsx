import type { HTMLAttributes, CSSProperties } from 'react';

const cardStyle: CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  padding: '24px',
  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
};

export function Card({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div style={{ ...cardStyle, ...style }} className={className} {...props} />;
}

export function CardHeader({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div style={{ marginBottom: '16px', ...style }} className={className} {...props} />;
}

export function CardTitle({ className, style, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', ...style }}
      className={className}
      {...props}
    />
  );
}

export function CardDescription({ className, style, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      style={{ marginTop: '4px', fontSize: '14px', color: 'var(--color-text-secondary)', ...style }}
      className={className}
      {...props}
    />
  );
}

export function CardContent({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div style={style} className={className} {...props} />;
}

export function CardFooter({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={{ marginTop: '24px', display: 'flex', alignItems: 'center', ...style }}
      className={className}
      {...props}
    />
  );
}
