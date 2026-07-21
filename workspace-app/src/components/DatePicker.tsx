'use client';

import { useEffect, useRef, useState } from 'react';
import { MON, MONFULL, fmtShort, toIso, todayISO } from '@/lib/dates';

// Custom date picker styled after the Windows laptop calendar flyout:
// day grid by default; clicking the "July 2026" header zooms OUT to a
// month grid, clicking the year zooms OUT again to a year grid, and each
// selection zooms back IN one level. Native date inputs can't be styled
// or animated, hence this component.

const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type View = 'days' | 'months' | 'years';

function parseIso(iso: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) };
}

export default function DatePicker({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const sel = parseIso(value);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('days');
  const [dir, setDir] = useState<'in' | 'out'>('out');
  const [y, setY] = useState(sel ? sel.y : now.getFullYear());
  const [m, setM] = useState(sel ? sel.m0 : now.getMonth());
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean }>({ left: 0, top: 0, up: false });
  const fieldRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const today = todayISO();

  function openPicker() {
    if (disabled) return;
    const s = parseIso(value);
    setY(s ? s.y : now.getFullYear());
    setM(s ? s.m0 : now.getMonth());
    setView('days');
    setDir('out');
    const r = fieldRef.current!.getBoundingClientRect();
    const up = r.bottom + 342 > window.innerHeight;
    setPos({
      left: Math.min(Math.max(8, r.left), window.innerWidth - 268),
      top: up ? r.top - 8 : r.bottom + 8,
      up,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) && e.target !== fieldRef.current) {
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

  const zoomOutTo = (v: View) => {
    setDir('out');
    setView(v);
  };
  const zoomInTo = (v: View) => {
    setDir('in');
    setView(v);
  };

  function stepDays(delta: number) {
    const t = m + delta;
    setY(y + Math.floor(t / 12));
    setM(((t % 12) + 12) % 12);
  }

  const yearStart = y - (y % 12);

  function pickDay(date: Date) {
    onChange(toIso(date));
    setOpen(false);
  }

  const dayCells: { date: Date; dim: boolean }[] = [];
  {
    const startOffset = new Date(y, m, 1).getDay();
    for (let i = 0; i < 42; i++) {
      const date = new Date(y, m, 1 - startOffset + i);
      dayCells.push({ date, dim: date.getMonth() !== m });
    }
  }

  return (
    <>
      <button
        ref={fieldRef}
        className={`dp-field${value ? '' : ' empty'}`}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={openPicker}
      >
        {value ? fmtShort(value) : '—'}
      </button>
      {open && (
        <div
          ref={popRef}
          className="dp-pop"
          role="dialog"
          aria-label="Choose a date"
          style={{ left: pos.left, top: pos.top, transform: pos.up ? 'translateY(-100%)' : undefined }}
        >
          {view === 'days' && (
            <div className={`dp-view ${dir}`} key="days">
              <div className="dp-head">
                <button className="dp-nav" aria-label="Previous month" onClick={() => stepDays(-1)}>‹</button>
                <button className="dp-title" onClick={() => zoomOutTo('months')}>
                  {MONFULL[m]} {y}
                </button>
                <button className="dp-nav" aria-label="Next month" onClick={() => stepDays(1)}>›</button>
              </div>
              <div className="dp-week">
                {WD.map((w) => (
                  <div className="dp-wd" key={w}>{w}</div>
                ))}
              </div>
              <div className="dp-grid">
                {dayCells.map(({ date, dim }, i) => {
                  const iso = toIso(date);
                  return (
                    <button
                      key={i}
                      className={`dp-cell${dim ? ' dim' : ''}${iso === today ? ' today' : ''}${iso === value ? ' sel' : ''}`}
                      onClick={() => pickDay(date)}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="dp-foot">
                <button className="dp-link" onClick={() => { onChange(today); setOpen(false); }}>Today</button>
                <button className="dp-link dim" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
              </div>
            </div>
          )}
          {view === 'months' && (
            <div className={`dp-view ${dir}`} key="months">
              <div className="dp-head">
                <button className="dp-nav" aria-label="Previous year" onClick={() => setY(y - 1)}>‹</button>
                <button className="dp-title" onClick={() => zoomOutTo('years')}>{y}</button>
                <button className="dp-nav" aria-label="Next year" onClick={() => setY(y + 1)}>›</button>
              </div>
              <div className="dp-grid wide">
                {MON.map((name, i) => (
                  <button
                    key={name}
                    className={`dp-cell${sel && sel.y === y && sel.m0 === i ? ' sel' : now.getFullYear() === y && now.getMonth() === i ? ' today' : ''}`}
                    onClick={() => {
                      setM(i);
                      zoomInTo('days');
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {view === 'years' && (
            <div className={`dp-view ${dir}`} key="years">
              <div className="dp-head">
                <button className="dp-nav" aria-label="Previous years" onClick={() => setY(y - 12)}>‹</button>
                <div className="dp-title static">{yearStart}–{yearStart + 11}</div>
                <button className="dp-nav" aria-label="Next years" onClick={() => setY(y + 12)}>›</button>
              </div>
              <div className="dp-grid wide">
                {Array.from({ length: 12 }).map((_, i) => {
                  const yy = yearStart + i;
                  return (
                    <button
                      key={yy}
                      className={`dp-cell${sel && sel.y === yy ? ' sel' : now.getFullYear() === yy ? ' today' : ''}`}
                      onClick={() => {
                        setY(yy);
                        zoomInTo('months');
                      }}
                    >
                      {yy}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
