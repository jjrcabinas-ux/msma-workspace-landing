'use client';

import { useEffect, useRef, useState } from 'react';

/** Custom dropdown with the workspace's vertical drop-open animation —
 *  native selects are OS-rendered and can't be animated. Fixed-positioned
 *  so table overflow can't clip the menu. */
export default function Select({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0, up: false });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const r = btnRef.current!.getBoundingClientRect();
    const height = options.length * 34 + 16;
    const up = r.bottom + height + 8 > window.innerHeight;
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: r.width, up });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const scroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className={`mem-input sel-field${open ? ' open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span>{value || 'Select…'}</span>
        <span className="sel-caret">▾</span>
      </button>
      {open && (
        <div
          ref={popRef}
          className="sel-pop"
          role="listbox"
          style={{ left: pos.left, top: pos.top, minWidth: pos.width, transform: pos.up ? 'translateY(-100%)' : undefined }}
        >
          {options.map((o) => (
            <button
              key={o}
              role="option"
              aria-selected={o === value}
              className={`sel-opt${o === value ? ' on' : ''}`}
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
