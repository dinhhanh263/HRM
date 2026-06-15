'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

const avatarStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  width: '40px',
  height: '40px',
  flexShrink: 0,
  overflow: 'hidden',
  borderRadius: '9999px',
};

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, style, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    style={{ ...avatarStyle, ...style }}
    className={className}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, style, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    style={{ aspectRatio: '1/1', width: '100%', height: '100%', objectFit: 'cover', ...style }}
    className={className}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const fallbackStyle: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  height: '100%',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '9999px',
  backgroundColor: 'var(--color-surface-alt)',
  color: 'var(--color-text-secondary)',
  fontSize: '14px',
  fontWeight: 500,
};

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, style, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    style={{ ...fallbackStyle, ...style }}
    className={className}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
