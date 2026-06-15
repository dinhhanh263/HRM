'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const subTriggerStyle: React.CSSProperties = {
  display: 'flex',
  cursor: 'pointer',
  userSelect: 'none',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '6px',
  padding: '8px',
  fontSize: '14px',
  color: 'var(--color-text-primary)',
  outline: 'none',
};

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }
>(({ className, inset, children, style, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    style={{ ...subTriggerStyle, paddingLeft: inset ? '32px' : '8px', ...style }}
    className={className}
    {...props}
  >
    {children}
    <ChevronRight style={{ marginLeft: 'auto', width: '16px', height: '16px' }} />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const subContentStyle: React.CSSProperties = {
  zIndex: 50,
  minWidth: '8rem',
  overflow: 'hidden',
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-surface)',
  padding: '4px',
  color: 'var(--color-text-primary)',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
};

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, style, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    style={{ ...subContentStyle, ...style }}
    className={className}
    {...props}
  />
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const contentStyle: React.CSSProperties = {
  zIndex: 50,
  maxHeight: '300px',
  minWidth: '8rem',
  overflowY: 'auto',
  overflowX: 'hidden',
  borderRadius: '8px',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-surface)',
  padding: '4px',
  color: 'var(--color-text-primary)',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
};

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, style, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      style={{ ...contentStyle, ...style }}
      className={className}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const itemStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  cursor: 'pointer',
  userSelect: 'none',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '6px',
  padding: '8px',
  fontSize: '14px',
  color: 'var(--color-text-primary)',
  outline: 'none',
  transition: 'background-color 150ms ease',
};

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }
>(({ className, inset, style, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    style={{ ...itemStyle, paddingLeft: inset ? '32px' : '8px', ...style }}
    className={className}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const checkboxItemStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  cursor: 'pointer',
  userSelect: 'none',
  alignItems: 'center',
  borderRadius: '6px',
  padding: '8px 8px 8px 32px',
  fontSize: '14px',
  color: 'var(--color-text-primary)',
  outline: 'none',
  transition: 'background-color 150ms ease',
};

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, style, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    style={{ ...checkboxItemStyle, ...style }}
    className={className}
    checked={checked}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
    {...props}
  >
    <span
      style={{
        position: 'absolute',
        left: '8px',
        display: 'flex',
        width: '14px',
        height: '14px',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <DropdownMenuPrimitive.ItemIndicator>
        <Check style={{ width: '16px', height: '16px', color: 'var(--color-primary)' }} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, style, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    style={{ ...checkboxItemStyle, ...style }}
    className={className}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
    {...props}
  >
    <span
      style={{
        position: 'absolute',
        left: '8px',
        display: 'flex',
        width: '14px',
        height: '14px',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle style={{ width: '8px', height: '8px', fill: 'var(--color-primary)', color: 'var(--color-primary)' }} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, style, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    style={{
      padding: '6px 8px',
      paddingLeft: inset ? '32px' : '8px',
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--color-text-secondary)',
      ...style,
    }}
    className={className}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, style, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    style={{ margin: '4px -4px', height: '1px', backgroundColor: 'var(--color-border)', ...style }}
    className={className}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      style={{ marginLeft: 'auto', fontSize: '12px', letterSpacing: '0.1em', color: 'var(--color-text-muted)', ...style }}
      className={className}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
