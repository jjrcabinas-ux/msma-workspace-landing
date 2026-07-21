'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Client } from '@/lib/types';
import { todayISO } from '@/lib/dates';
import {
  EMPTY_REC, RETURNS, RET_KEYS, STEPS, TAX_KEYS, TAX_PAGES,
  type Period, type RetKey, type TaxRecord,
  daysBetweenYmd, deadlineFor, expectedPeriods, flagFor, fmtMoney, fmtYmd,
  periodKey, periodLabel, periodOptions, prevValidOrNull, rqEmail, stepValid,
  todayInt, validDefaultPeriod, ymdInt,
} from '@/lib/birReturns';
import ListModal from '@/components/ListModal';
import Select from '@/components/Select';

// Tax Compliance — ported from the msma-tax-compliance system: the Overview
// compliance dashboard plus the per-tax-type BIR return pipelines
// (RQ → Data Received → Drafted → Reviewed → Approved → Filed → Paid →
// Archived). Clients come from the workspace Client Masterlist.

const HOME_CLUSTERS = ['RPM', 'VCM', 'ADS'];
const FLAG_FILTERS = ['All statuses', 'Overdue / at risk', 'Needs follow-up', 'Filed / done', 'In progress'];
const CHAN_FILTERS = ['All channels', 'eBIR', 'eFPS'];
const SCOPE_OPTS = ['All Period', 'Monthly', 'Quarterly'];

type RecordsMap = Record<string, Record<string, TaxRecord>>; // `${ret}|${pk}` -> clientId -> record

export default function TaxCompliance({
  isAdmin,
  myCluster,
}: {
  isAdmin: boolean;
  myCluster: string; // uppercase, '' when unassigned
}) {
  const memberCluster = HOME_CLUSTERS.includes(myCluster) ? myCluster : '';
  const [adminCluster, setAdminCluster] = useState(HOME_CLUSTERS[0]);
  const cluster = isAdmin ? adminCluster : memberCluster;

  const [view, setView] = useState<string>('overview'); // 'overview' | tax type key
  const [activeRet, setActiveRet] = useState<Record<string, RetKey>>({});
  const [periods, setPeriods] = useState<Record<string, Period>>({});
  const [scope, setScope] = useState('All Period');
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState(FLAG_FILTERS[0]);
  const [chanFilter, setChanFilter] = useState(CHAN_FILTERS[0]);
  const [attnAll, setAttnAll] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [records, setRecords] = useState<RecordsMap>({});
  const [recCtx, setRecCtx] = useState<{ ret: RetKey; p: Period; client: Client } | null>(null);
  const [rTax, setRTax] = useState('');
  const [rRef, setRRef] = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rqCtx, setRqCtx] = useState<{ ret: RetKey; p: Period; client: Client; phase: 'choice' | 'email'; subject: string; body: string } | null>(null);
  const [rqMsg, setRqMsg] = useState('');
  const [compId, setCompId] = useState<string | null>(null);
  const [compFilter, setCompFilter] = useState<string | null>(null);

  useEffect(() => {
    setClients([]);
    if (!cluster) return;
    return onSnapshot(
      query(collection(db, 'clients'), where('cluster', '==', cluster)),
      (snap) => {
        const list: Client[] = [];
        snap.forEach((d) => {
          const v = d.data();
          list.push({
            id: d.id,
            cluster: (v.cluster as string) || '',
            name: (v.name as string) || '',
            tin: (v.tin as string) || '',
            rdo: (v.rdo as string) || '',
            address: (v.address as string) || '',
            channel: (v.channel as Client['channel']) || '',
            preparer: (v.preparer as string) || '',
            reviewer: (v.reviewer as string) || '',
            contacts: (v.contacts as Client['contacts']) || [],
            taxTypes: (v.taxTypes as Record<string, boolean>) || {},
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setClients(list);
      },
      () => {}
    );
  }, [cluster]);

  useEffect(() => {
    setRecords({});
    if (!cluster) return;
    return onSnapshot(
      query(collection(db, 'taxrecords'), where('cluster', '==', cluster)),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return; // keep optimistic local state
        const map: RecordsMap = {};
        snap.forEach((d) => {
          const v = d.data();
          const rk = `${v.ret}|${v.pk}`;
          if (!map[rk]) map[rk] = {};
          map[rk][(v.clientId as string) || ''] = {
            stage: (v.stage as number) || 0,
            dates: (v.dates as Record<string, string>) || {},
            taxDue: (v.taxDue as string) || '',
            ref: (v.ref as string) || '',
            notes: (v.notes as string) || '',
          };
        });
        setRecords(map);
      },
      () => {}
    );
  }, [cluster]);

  const clientsFor = (tax: string) => clients.filter((c) => c.taxTypes && c.taxTypes[tax]);
  const getPeriod = (ret: RetKey) => periods[ret] || validDefaultPeriod(ret);
  const getRec = (ret: RetKey, p: Period, clientId: string): TaxRecord =>
    (records[`${ret}|${periodKey(ret, p)}`] || {})[clientId] || { ...EMPTY_REC, dates: {} };

  function writeRec(ret: RetKey, p: Period, clientId: string, rec: TaxRecord) {
    const pk = periodKey(ret, p);
    const rk = `${ret}|${pk}`;
    setRecords((s) => ({ ...s, [rk]: { ...(s[rk] || {}), [clientId]: rec } }));
    setDoc(
      doc(db, 'taxrecords', `${cluster}_${ret}_${pk}_${clientId}`),
      { cluster, ret, pk, clientId, ...rec },
      { merge: true }
    ).catch(() => {});
  }

  function advance(ret: RetKey, p: Period, client: Client) {
    const rec = getRec(ret, p, client.id);
    if (rec.stage >= STEPS.length) return;
    writeRec(ret, p, client.id, {
      ...rec,
      stage: rec.stage + 1,
      dates: { ...rec.dates, [STEPS[rec.stage].key]: todayISO() },
    });
  }

  function stepRec(ret: RetKey, p: Period, client: Client, dir: number) {
    const rec = getRec(ret, p, client.id);
    if (dir === 1) {
      if (rec.stage === 0) {
        setRqMsg('');
        setRqCtx({ ret, p, client, phase: 'choice', subject: '', body: '' });
        return;
      }
      if (rec.stage < STEPS.length) advance(ret, p, client);
      return;
    }
    if (dir === -1 && rec.stage > 0) {
      const dates = { ...rec.dates };
      delete dates[STEPS[rec.stage - 1].key];
      writeRec(ret, p, client.id, { ...rec, stage: rec.stage - 1, dates });
    }
  }

  function goto(tax: string, ret: RetKey, p?: Period) {
    setView(tax);
    setActiveRet((s) => ({ ...s, [tax]: ret }));
    if (p) setPeriods((s) => ({ ...s, [ret]: p }));
    setSearch('');
    setFlagFilter(FLAG_FILTERS[0]);
    setChanFilter(CHAN_FILTERS[0]);
  }

  // ------- Overview computations (full expected universe) -------
  const overview = useMemo(() => {
    type AttnRow = { client: Client; ret: RetKey; p: Period; dl: { y: number; m: number; d: number }; stageWord: string; f: ReturnType<typeof flagFor> };
    const attn: AttnRow[] = [];
    const cards: { ret: RetKey; empty: boolean; due: number; idx: number; s: { total: number; filed: number; prog: number; amber: number; red: number }; pct: number; cycleP: Period; dleft: number; statusCls: string }[] = [];
    RET_KEYS.forEach((ret, idx) => {
      const R = RETURNS[ret];
      const list = clientsFor(R.tax);
      const s = { total: 0, filed: 0, prog: 0, amber: 0, red: 0 };
      expectedPeriods(ret).forEach((p) => {
        const recs = records[`${ret}|${periodKey(ret, p)}`] || {};
        list.forEach((client) => {
          const rec = recs[client.id] || EMPTY_REC;
          const f = flagFor(ret, client, p, rec);
          s.total++;
          if (rec.stage >= 6) s.filed++;
          else s.prog++;
          if (f.cls === 'amber') s.amber++;
          if (f.cls === 'red') s.red++;
          if (f.cls === 'red' || f.cls === 'amber') {
            attn.push({
              client, ret, p, f,
              dl: deadlineFor(ret, client, p).file,
              stageWord: rec.stage === 0 ? 'Not started' : STEPS[rec.stage - 1].label,
            });
          }
        });
      });
      const cycleP = validDefaultPeriod(ret);
      const gDL = deadlineFor(ret, { channel: 'eBIR' } as Client, cycleP).file;
      const dleft = daysBetweenYmd(todayInt(), gDL);
      let statusCls: string;
      if (!list.length) statusCls = 'empty';
      else if (dleft <= 3 || s.red > 0) statusCls = 'alert';
      else if (dleft <= 7) statusCls = 'warn';
      else statusCls = 'ontrack';
      cards.push({
        ret, idx, s, cycleP, dleft, statusCls,
        empty: !list.length,
        due: ymdInt(gDL.y, gDL.m, gDL.d),
        pct: s.total ? Math.round((100 * s.filed) / s.total) : 0,
      });
    });
    cards.sort((a, b) => (a.empty ? 1 : 0) - (b.empty ? 1 : 0) || (a.empty ? a.idx - b.idx : a.due - b.due || a.idx - b.idx));
    attn.sort((a, b) => a.f.rank - b.f.rank || ymdInt(a.dl.y, a.dl.m, a.dl.d) - ymdInt(b.dl.y, b.dl.m, b.dl.d));
    // per-company rollup
    const comp = clients.map((c) => {
      const e = { c, total: 0, filed: 0, prog: 0, amber: 0, red: 0 };
      RET_KEYS.forEach((ret) => {
        if (!(c.taxTypes && c.taxTypes[RETURNS[ret].tax])) return;
        expectedPeriods(ret).forEach((p) => {
          const rec = (records[`${ret}|${periodKey(ret, p)}`] || {})[c.id] || EMPTY_REC;
          const f = flagFor(ret, c, p, rec);
          e.total++;
          if (rec.stage >= 6) e.filed++;
          else e.prog++;
          if (f.cls === 'amber') e.amber++;
          if (f.cls === 'red') e.red++;
        });
      });
      return e;
    });
    return { cards, attn, comp };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, records]);

  // Company detail items (every tracked filing of one client, most urgent first)
  const compDetail = useMemo(() => {
    if (!compId) return null;
    const c = clients.find((x) => x.id === compId);
    if (!c) return null;
    const items: { ret: RetKey; p: Period; f: ReturnType<typeof flagFor>; dl: { y: number; m: number; d: number }; stageWord: string }[] = [];
    RET_KEYS.forEach((ret) => {
      if (!(c.taxTypes && c.taxTypes[RETURNS[ret].tax])) return;
      expectedPeriods(ret).forEach((p) => {
        const rec = (records[`${ret}|${periodKey(ret, p)}`] || {})[c.id] || EMPTY_REC;
        const f = flagFor(ret, c, p, rec);
        items.push({
          ret, p, f,
          dl: deadlineFor(ret, c, p).file,
          stageWord: rec.stage === 0 ? 'Not started' : rec.stage >= STEPS.length ? 'Archived ✓' : STEPS[rec.stage - 1].label,
        });
      });
    });
    items.sort((a, b) => a.f.rank - b.f.rank || ymdInt(a.dl.y, a.dl.m, a.dl.d) - ymdInt(b.dl.y, b.dl.m, b.dl.d));
    return { c, items };
  }, [compId, clients, records]);

  if (!cluster) {
    return (
      <>
        <div className="board-head"><h1>Tax Compliance</h1></div>
        <div style={{ height: 20 }} />
        <div className="soonboard">
          <b>No cluster assigned yet</b>Ask the administrator to add your email to a cluster in the Members module.
        </div>
      </>
    );
  }

  const flagChip = (f: ReturnType<typeof flagFor>) => <span className={`flagchip ${f.cls}`}>{f.text}</span>;

  // ---------------- Overview ----------------
  const renderOverview = () => {
    const shownCards = overview.cards.filter((c) => scope === 'All Period' || RETURNS[c.ret].freq === (scope === 'Monthly' ? 'M' : 'Q'));
    const attnRows = attnAll ? overview.attn : overview.attn.slice(0, 10);
    return (
      <>
        <div className="ret-grid">
          {shownCards.map((card) => {
            const R = RETURNS[card.ret];
            const duePill =
              !card.empty && card.dleft <= 7
                ? card.dleft < 0 ? 'overdue' : card.dleft === 0 ? 'due today' : `due in ${card.dleft} day${card.dleft === 1 ? '' : 's'}`
                : '';
            const gDL = deadlineFor(card.ret, { channel: 'eBIR' } as Client, card.cycleP).file;
            return (
              <button className={`ret-card ${card.statusCls}`} key={card.ret} onClick={() => goto(R.tax, card.ret, card.cycleP)}>
                <div className="rc-head">
                  <span className="rc-form">{R.form}</span>
                  <span className="rc-tax">{R.tax}</span>
                </div>
                <div className="rc-meta">
                  {periodLabel(card.ret, card.cycleP)}
                  {!card.empty && <> · Due {fmtYmd(gDL)}{duePill && <span className="duepill">{duePill}</span>}</>}
                </div>
                {card.empty ? (
                  <div className="rc-empty">No clients in this cycle</div>
                ) : (
                  <>
                    <div className="rc-progress">
                      <div className="rc-bar"><i style={{ width: `${card.pct}%` }} /></div>
                      <span className="rc-pct">{card.pct}%</span>
                    </div>
                    <div className="rc-stats">
                      <div className="rc-stat green"><b>{card.s.filed}/{card.s.total}</b><span>Filed</span></div>
                      <div className="rc-stat"><b>{card.s.prog}</b><span>In progress</span></div>
                      <div className="rc-stat amber"><b>{card.s.amber}</b><span>Follow-up</span></div>
                      <div className="rc-stat red"><b>{card.s.red}</b><span>At risk</span></div>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="tc-card">
          <div className="tc-card-title">Needs attention <span className="due-count">{overview.attn.length}</span></div>
          {overview.attn.length ? (
            <div className="tc-scroll">
              <div className="tc-table attn">
                <div className="tc-row head"><div>Client</div><div>Return</div><div>Deadline</div><div>Last step done</div><div>Flag</div></div>
                {attnRows.map((r, i) => (
                  <button className="tc-row item" key={`${r.ret}-${periodKey(r.ret, r.p)}-${r.client.id}-${i}`} onClick={() => goto(RETURNS[r.ret].tax, r.ret, r.p)}>
                    <div>
                      <div className="tc-name">{r.client.name}</div>
                      <div className="tc-sub">{r.client.preparer || 'unassigned'}</div>
                    </div>
                    <div><b>{RETURNS[r.ret].form}</b><div className="tc-sub">{periodLabel(r.ret, r.p)}</div></div>
                    <div className="tc-sub">{fmtYmd(r.dl)}</div>
                    <div className="tc-sub">{r.stageWord}</div>
                    <div>{flagChip(r.f)}</div>
                  </button>
                ))}
              </div>
              {overview.attn.length > 10 && (
                <button className="tc-more" onClick={() => setAttnAll((v) => !v)}>
                  {attnAll ? 'Show less ▲' : `See ${overview.attn.length - 10} more ▼`}
                </button>
              )}
            </div>
          ) : (
            <div className="empty-note">Nothing needs attention. All tracked returns are on track. ✓</div>
          )}
        </div>

        <div className="tc-card">
          <div className="tc-card-title">Company summary</div>
          {overview.comp.length ? (
            <div className="tc-scroll">
              <div className="tc-table comp">
                <div className="tc-row head"><div>Company</div><div>Filings</div><div>Filed</div><div>In progress</div><div>Follow-up</div><div>At risk</div><div>Done</div></div>
                {overview.comp.map((e) => {
                  const pctC = e.total ? Math.round((100 * e.filed) / e.total) : 0;
                  return (
                    <button className="tc-row item" key={e.c.id} onClick={() => { setCompFilter(null); setCompId(e.c.id); }}>
                      <div>
                        <div className="tc-name">{e.c.name}</div>
                        <div className="tc-sub">{e.c.preparer || 'unassigned'}</div>
                      </div>
                      <div>{e.total || '—'}</div>
                      <div className="cs-green">{e.filed}</div>
                      <div>{e.prog}</div>
                      <div className="cs-amber">{e.amber}</div>
                      <div className="cs-red">{e.red}</div>
                      <div>
                        {e.total ? (
                          <div className="cs-done"><div className="cs-bar"><i style={{ width: `${pctC}%` }} /></div><span>{pctC}%</span></div>
                        ) : (
                          <span className="tc-sub">no records</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-note">No companies yet — add clients in the Client Masterlist.</div>
          )}
        </div>
      </>
    );
  };

  // ---------------- Tax page ----------------
  const renderTaxPage = (tax: string) => {
    const page = TAX_PAGES[tax];
    const ret = activeRet[tax] || page.returns[0];
    const p = getPeriod(ret);
    const R = RETURNS[ret];
    const list = clientsFor(tax).sort((a, b) => a.name.localeCompare(b.name));
    const q = search.trim().toLowerCase();

    const stats = { total: 0, filed: 0, prog: 0, amber: 0, red: 0 };
    const rows: { rank: number; client: Client; rec: TaxRecord; f: ReturnType<typeof flagFor> }[] = [];
    list.forEach((c) => {
      const rec = getRec(ret, p, c.id);
      const f = flagFor(ret, c, p, rec);
      if (q && !`${c.name} ${c.tin} ${c.preparer} ${c.reviewer}`.toLowerCase().includes(q)) return;
      if (chanFilter !== 'All channels' && c.channel !== chanFilter) return;
      if (flagFilter === 'Overdue / at risk' && f.cls !== 'red') return;
      if (flagFilter === 'Needs follow-up' && f.cls !== 'amber') return;
      if (flagFilter === 'Filed / done' && f.cls !== 'green') return;
      if (flagFilter === 'In progress' && f.cls === 'green') return;
      stats.total++;
      if (rec.stage >= 6) stats.filed++;
      else stats.prog++;
      if (f.cls === 'amber') stats.amber++;
      if (f.cls === 'red') stats.red++;
      rows.push({ rank: f.rank * 10 + (f.text === 'OVERDUE' ? 0 : 1), client: c, rec, f });
    });
    rows.sort((a, b) => a.rank - b.rank);

    return (
      <>
        <div className="tc-page-head">
          <h2>{page.title}</h2>
          <PeriodNav ret={ret} p={p} onPick={(np) => setPeriods((s) => ({ ...s, [ret]: np }))} />
        </div>
        <div className="tc-sub-line">{R.form} — {R.name} · {list.length} applicable client{list.length === 1 ? '' : 's'} in the {cluster} Cluster</div>
        {page.returns.length > 1 && (
          <div className="tc-tabs sub">
            {page.returns.map((r) => (
              <button key={r} className={`tc-tab${r === ret ? ' active' : ''}`} onClick={() => setActiveRet((s) => ({ ...s, [tax]: r }))}>
                {RETURNS[r].form} · {RETURNS[r].freq === 'M' ? 'Monthly' : RETURNS[r].freq === 'Q' ? 'Quarterly' : 'Annual'}
              </button>
            ))}
          </div>
        )}
        <div className="tc-stat-row">
          <div className="tc-stat"><b>{stats.total}</b><span>Clients this period</span></div>
          <div className="tc-stat green"><b>{stats.filed}</b><span>Filed</span></div>
          <div className="tc-stat"><b>{stats.prog}</b><span>In pipeline</span></div>
          <div className="tc-stat amber"><b>{stats.amber}</b><span>Needs follow-up</span></div>
          <div className="tc-stat red"><b>{stats.red}</b><span>At risk / overdue</span></div>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <div className="etm-search" style={{ marginLeft: 0, flex: 1, maxWidth: 380 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input type="search" placeholder="Search client, TIN, or staff…" aria-label="Search clients" style={{ width: '100%' }}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={flagFilter} options={FLAG_FILTERS} onChange={setFlagFilter} ariaLabel="Filter by status" />
          <Select value={chanFilter} options={CHAN_FILTERS} onChange={setChanFilter} ariaLabel="Filter by channel" />
        </div>
        <div className="tc-scroll">
          <div className="tc-table pipe-t">
            <div className="tc-row head"><div>Client</div><div>Channel</div><div>Deadline</div><div>Pipeline</div><div>Tax due</div><div>Flag</div></div>
            {rows.map(({ client: c, rec, f }) => {
              const dl = deadlineFor(ret, c, p);
              const statusWord = rec.stage === 0 ? 'Not started'
                : rec.stage >= STEPS.length ? 'Archived ✓'
                : `${STEPS[rec.stage - 1].label} · next: ${STEPS[rec.stage].label}`;
              return (
                <div className="tc-row item static" key={c.id}>
                  <div>
                    <div className="tc-name">{c.name}</div>
                    <div className="tc-sub">{c.tin || '—'} · {c.preparer || 'unassigned'}{c.reviewer ? ` / ${c.reviewer}` : ''}</div>
                  </div>
                  <div>{c.channel ? <span className={`chan-chip ${c.channel === 'eBIR' ? 'ebir' : 'efps'}`}>{c.channel}</span> : '—'}</div>
                  <div className="tc-sub">File: <b style={{ color: 'var(--white)' }}>{fmtYmd(dl.file)}</b><br />Pay: {fmtYmd(dl.pay)}</div>
                  <div>
                    <div className="pipe-line">
                      <div className="pipe">
                        {STEPS.map((s, i) => {
                          const done = i < rec.stage;
                          const next = i === rec.stage;
                          const tip = s.label + (rec.dates[s.key] ? ` · ${rec.dates[s.key]}` : '');
                          return <span key={s.key} className={`step${done ? ' done' : next ? ' next' : ''}`} title={tip}>{s.short}</span>;
                        })}
                      </div>
                      <div className="pipe-actions">
                        <button title="Step back" onClick={() => stepRec(ret, p, c, -1)}>−</button>
                        <button title="Advance step" onClick={() => stepRec(ret, p, c, 1)}>＋</button>
                      </div>
                    </div>
                    <div className="tc-sub" style={{ marginTop: 3 }}>{statusWord}</div>
                  </div>
                  <button
                    className="tc-money"
                    title="Open filing detail"
                    onClick={() => {
                      setRTax(rec.taxDue);
                      setRRef(rec.ref);
                      setRNotes(rec.notes);
                      setRecCtx({ ret, p, client: c });
                    }}
                  >
                    {fmtMoney(rec.taxDue)}
                    {rec.ref ? <span className="tc-sub">FRN {rec.ref}</span> : null}
                  </button>
                  <div>{flagChip(f)}</div>
                </div>
              );
            })}
            {!rows.length && (
              <div className="tc-row item static">
                <div className="tc-sub" style={{ gridColumn: '1 / -1' }}>
                  {list.length
                    ? 'No clients match the current filters.'
                    : `No clients tagged for ${tax} — tag them with the ${tax} tax type in the Client Masterlist to track ${R.form} here.`}
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="board-head">
        <h1>Tax Compliance</h1>
        <div className="desc">
          {view === 'overview'
            ? `Compliance summary for the ${cluster} Cluster · full filing universe since Jan 2026`
            : 'BIR return pipeline · click − / ＋ to move a filing through the steps'}
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <div className="tc-tabs" style={{ flex: 1 }}>
          <button className={`tc-tab${view === 'overview' ? ' active' : ''}`} onClick={() => setView('overview')}>Overview</button>
          {TAX_KEYS.map((t) => (
            <button key={t} className={`tc-tab${view === t ? ' active' : ''}`} onClick={() => goto(t, activeRet[t] || TAX_PAGES[t].returns[0])}>{t}</button>
          ))}
        </div>
        {view === 'overview' && <Select value={scope} options={SCOPE_OPTS} onChange={setScope} ariaLabel="Period scope" />}
        {isAdmin && <Select value={adminCluster} options={HOME_CLUSTERS} onChange={setAdminCluster} ariaLabel="Cluster" />}
      </div>

      {view === 'overview' ? renderOverview() : renderTaxPage(view)}

      {compDetail && (
        <ListModal className="cal-wide" title={compDetail.c.name} onClose={() => setCompId(null)}>
          <div className="tc-sub" style={{ marginBottom: 10 }}>
            TIN {compDetail.c.tin || '—'} · {compDetail.c.preparer || 'unassigned'}{compDetail.c.reviewer ? ` / ${compDetail.c.reviewer}` : ''} · {compDetail.c.channel || '—'}
          </div>
          <div className="comp-tiles">
            {([
              [null, `${compDetail.items.length}`, 'Tracked filings'],
              ['filed', `${compDetail.items.filter((i) => i.f.rank >= 3).length}`, 'Filed'],
              ['prog', `${compDetail.items.filter((i) => i.f.rank < 3).length}`, 'In progress'],
              ['amber', `${compDetail.items.filter((i) => i.f.cls === 'amber').length}`, 'Follow-up'],
              ['red', `${compDetail.items.filter((i) => i.f.cls === 'red').length}`, 'At risk'],
            ] as const).map(([key, n, label]) => (
              <button key={label} className={`comp-tile${compFilter === key ? ' sel' : ''}`}
                onClick={() => setCompFilter(compFilter === key ? null : key)}>
                <b>{n}</b><span>{label}</span>
              </button>
            ))}
          </div>
          {compDetail.items
            .filter((i) =>
              !compFilter ? true
              : compFilter === 'filed' ? i.f.rank >= 3
              : compFilter === 'prog' ? i.f.rank < 3
              : compFilter === 'amber' ? i.f.cls === 'amber'
              : i.f.cls === 'red')
            .map((i, idx) => (
              <button
                key={`${i.ret}-${periodKey(i.ret, i.p)}-${idx}`}
                className="snap-row tc-jump"
                onClick={() => { setCompId(null); goto(RETURNS[i.ret].tax, i.ret, i.p); }}
              >
                <div className="snap-body">
                  <b>{RETURNS[i.ret].form}</b> · {periodLabel(i.ret, i.p)}
                  <div className="gs-sub">Deadline {fmtYmd(i.dl)} · {i.stageWord}</div>
                </div>
                {flagChip(i.f)}
              </button>
            ))}
        </ListModal>
      )}

      {recCtx && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRecCtx(null); }}>
          <div className="uname-card prof-card" role="dialog" aria-modal="true">
            <h3>{recCtx.client.name} · {RETURNS[recCtx.ret].form} · {periodLabel(recCtx.ret, recCtx.p)}</h3>
            <div className="prof-grid">
              <div className="prof-field">
                <label>Tax due (₱)</label>
                <input className="mem-input" type="number" min="0" step="0.01" placeholder="0.00" value={rTax} onChange={(e) => setRTax(e.target.value)} />
              </div>
              <div className="prof-field">
                <label>Confirmation / FRN no.</label>
                <input className="mem-input" placeholder="Filing reference no." value={rRef} onChange={(e) => setRRef(e.target.value)} />
              </div>
              <div className="prof-field full">
                <label>Notes for this period</label>
                <input className="mem-input" placeholder="Variances, client delays, penalty exposure…" value={rNotes} onChange={(e) => setRNotes(e.target.value)} />
              </div>
              <div className="prof-field full">
                <label>Step history</label>
                <div className="tc-history">
                  {STEPS.map((s) => {
                    const d = getRec(recCtx.ret, recCtx.p, recCtx.client.id).dates[s.key];
                    return (
                      <div key={s.key} className={d ? 'done' : ''}>
                        {d ? `✓ ${s.label} — ${d}` : `○ ${s.label}`}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="uname-actions">
              <button className="uname-skip" onClick={() => setRecCtx(null)}>Close</button>
              <button
                className="tool-new"
                onClick={() => {
                  const rec = getRec(recCtx.ret, recCtx.p, recCtx.client.id);
                  writeRec(recCtx.ret, recCtx.p, recCtx.client.id, { ...rec, taxDue: rTax, ref: rRef.trim(), notes: rNotes.trim() });
                  setRecCtx(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {rqCtx && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRqCtx(null); }}>
          <div className={`uname-card ${rqCtx.phase === 'email' ? 'client-card' : ''}`} role="dialog" aria-modal="true">
            <h3>Data request · {rqCtx.client.name} · {RETURNS[rqCtx.ret].form} · {periodLabel(rqCtx.ret, rqCtx.p)}</h3>
            {rqCtx.phase === 'choice' ? (
              <>
                <p>Have you already requested the data from the client?</p>
                <div className="rq-opts">
                  <button className="rq-opt" onClick={() => { advance(rqCtx.ret, rqCtx.p, rqCtx.client); setRqCtx(null); }}>
                    <b>✓ Yes, already requested</b>
                    <span>Mark the Data Requested step as done</span>
                  </button>
                  <button
                    className="rq-opt"
                    onClick={() => {
                      const { subject, body } = rqEmail(rqCtx.ret, rqCtx.client, rqCtx.p);
                      setRqCtx({ ...rqCtx, phase: 'email', subject, body });
                    }}
                  >
                    <b>✉ No — use the sample email template</b>
                    <span>Draft the data-request email for this client and period</span>
                  </button>
                </div>
                <div className="uname-actions">
                  <button className="uname-skip" onClick={() => setRqCtx(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="prof-grid">
                  <div className="prof-field full">
                    <label>Subject</label>
                    <input className="mem-input" readOnly value={rqCtx.subject} />
                  </div>
                  <div className="prof-field full">
                    <label>Email body <span className="tc-sub">(editable — adjust before copying)</span></label>
                    <textarea className="mem-input rq-body" rows={12} value={rqCtx.body}
                      onChange={(e) => setRqCtx({ ...rqCtx, body: e.target.value })} />
                  </div>
                </div>
                {rqMsg && <div className="ann-sent" role="status">{rqMsg}</div>}
                <div className="uname-actions" style={{ flexWrap: 'wrap' }}>
                  <button className="uname-skip" onClick={() => navigator.clipboard.writeText(rqCtx.subject).then(() => setRqMsg('Subject copied to clipboard')).catch(() => {})}>Copy subject</button>
                  <button className="uname-skip" onClick={() => navigator.clipboard.writeText(rqCtx.body).then(() => setRqMsg('Email body copied to clipboard')).catch(() => {})}>Copy body</button>
                  <button className="uname-skip" onClick={() => setRqCtx(null)}>Cancel</button>
                  <button className="tool-new" onClick={() => { advance(rqCtx.ret, rqCtx.p, rqCtx.client); setRqCtx(null); }}>Mark as requested ✓</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Period navigation: ‹ [period ▾] › with a grid picker grouped by year.
function PeriodNav({ ret, p, onPick }: { ret: RetKey; p: Period; onPick: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  const f = RETURNS[ret].freq;
  const byYear: Record<string, Period[]> = {};
  periodOptions(ret, p).forEach((o) => { (byYear[o.y] = byYear[o.y] || []).push(o); });
  const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div className="period-nav">
      <button className="cal-nav" aria-label="Previous period" disabled={!prevValidOrNull(ret, p)}
        onClick={() => { const prev = prevValidOrNull(ret, p); if (prev) onPick(prev); }}>‹</button>
      <div className="pp-wrap">
        <button className="pp-btn" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
          {periodLabel(ret, p)} <span className="pp-chev">▾</span>
        </button>
        {open && (
          <div className="pp-pop" onClick={(e) => e.stopPropagation()}>
            {Object.keys(byYear).sort().map((y) => (
              <div key={y}>
                {f !== 'A' && <div className="pp-year">{y}</div>}
                <div className={`pp-grid${f === 'M' ? '' : f === 'Q' ? ' q' : ' a'}`}>
                  {byYear[y].map((o) => {
                    const sel = periodKey(ret, o) === periodKey(ret, p);
                    const label = f === 'M' ? MONTHS3[(o.m || 1) - 1] : f === 'Q' ? `Q${o.q}` : `TY ${o.y}`;
                    return (
                      <button key={periodKey(ret, o)} className={`pp-opt${sel ? ' sel' : ''}`} title={periodLabel(ret, o)}
                        onClick={() => { onPick(o); setOpen(false); }}>{label}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="cal-nav" aria-label="Next period" onClick={() => onPick(stepValid(ret, p, 1))}>›</button>
    </div>
  );
}
