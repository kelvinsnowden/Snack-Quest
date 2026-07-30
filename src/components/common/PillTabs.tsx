import React, { useRef } from 'react';

export interface PillTabItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  badge?: string | number;
}

interface PillTabsProps {
  items: PillTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

export const PillTabs: React.FC<PillTabsProps> = ({ items, activeId, onChange, ariaLabel, className }) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusTab = (index: number) => {
    const item = items[(index + items.length) % items.length];
    refs.current[item.id]?.focus();
    onChange(item.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(items.length - 1);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 overflow-x-auto ${className || ''}`}
    >
      {items.map((item, index) => {
        const isActive = item.id === activeId;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[item.id] = el;
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onChange(item.id)}
            className={`inline-flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-creator-control text-creator-caption font-semibold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/50 ${
              isActive
                ? 'bg-creator-brand text-creator-brand-ink'
                : 'text-creator-ink-muted hover:text-creator-ink hover:bg-creator-surface-hover'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                  isActive ? 'bg-creator-brand-ink/20 text-creator-brand-ink' : 'bg-creator-surface-hover text-creator-ink-faint'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
