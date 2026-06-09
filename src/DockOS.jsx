import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================================
   DockOS — Work OS for small port drayage operators (Long Beach / San Pedro Bay)
   Single-file React app. Persists to localStorage (survives refresh & sessions).
   ============================================================================ */

// ---------- Design tokens ----------
const C = {
  navy: "#0B1F2A",
  navy2: "#102C3A",
  panel: "#13323F",
  steel: "#8FA3AD",
  steelDim: "#5E747F",
  amber: "#E8A33D",
  amberDeep: "#C9842A",
  vermillion: "#D8492B",
  teal: "#3FA796",
  deck: "#F2EFE9",
  line: "#1E4150",
  lineSoft: "rgba(143,163,173,0.18)",
};

const STATUSES = [
  { key: "booked", label: "Booked", hint: "Job in, not yet moving" },
  { key: "atterminal", label: "At terminal", hint: "Driver pulling container" },
  { key: "loaded", label: "Loaded / rolling", hint: "Container on chassis, en route" },
  { key: "delivered", label: "Delivered", hint: "Dropped, awaiting empty return" },
  { key: "invoiced", label: "Invoiced", hint: "Billed, done" },
];

const TODAY = () => new Date().toISOString().slice(0, 10);

// ---------- Storage helpers (browser localStorage, with in-memory fallback) ----------
const memStore = {};
const store = {
  async get(k) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) return v;
    } catch (e) { /* localStorage blocked (private mode, etc.) */ }
    return k in memStore ? memStore[k] : null;
  },
  async set(k, v) {
    try {
      localStorage.setItem(k, v);
      return;
    } catch (e) { /* fall through to memory */ }
    memStore[k] = v;
  },
};
const KEY = "dockos:data:v1";

// ---------- Seed data (Long Beach realistic) ----------
function seed() {
  const t = new Date();
  const d = (offset) => {
    const x = new Date(t);
    x.setDate(x.getDate() + offset);
    return x.toISOString().slice(0, 10);
  };
  return {
    drivers: [
      { id: "drv1", name: "Marco Reyes", phone: "(562) 555-0142", truck: "Truck 1 · ZEV", active: true },
      { id: "drv2", name: "Tuan Pham", phone: "(562) 555-0193", truck: "Truck 2", active: true },
      { id: "drv3", name: "DeShawn Hill", phone: "(310) 555-0177", truck: "Truck 3 · ZEV", active: true },
    ],
    brokers: [
      { id: "brk1", name: "Pacific Rim Forwarding", contact: "Lena Ortiz", phone: "(213) 555-0110", payDays: 21, rating: "fast", notes: "Pays NET-21 like clockwork. Good rates on Pier T lanes." },
      { id: "brk2", name: "Harborlight Logistics", contact: "Sam Whitaker", phone: "(424) 555-0166", payDays: 52, rating: "slow", notes: "Chronic slow pay. Always disputes detention. Get POD signed in person." },
      { id: "brk3", name: "Crescent Freight Co", contact: "Priya Nair", phone: "(562) 555-0188", payDays: 30, rating: "ok", notes: "NET-30. Reasonable. High volume out of TTI." },
    ],
    loads: [
      mkLoad("MSCU7841203", "brk1", "drv1", "TTI (Pier T)", "Rancho Dominguez DC", 525, "loaded", d(0), d(2), false),
      mkLoad("TGHU6620914", "brk2", "drv2", "LBCT (Pier E)", "Carson Warehouse", 480, "delivered", d(-2), d(0), false),
      mkLoad("CAIU3390172", "brk3", "drv3", "ITS (Pier G)", "Compton CFS", 560, "atterminal", d(0), d(1), false),
      mkLoad("HLXU8123455", "brk1", null, "Pier A", "Paramount DC", 510, "booked", d(1), d(4), false),
      mkLoad("FCIU4471028", "brk2", "drv1", "LBCT (Pier E)", "Signal Hill yard", 445, "delivered", d(-5), d(-1), false),
      mkLoad("MSDU2298710", "brk3", "drv2", "TTI (Pier T)", "Long Beach transload", 590, "invoiced", d(-8), d(-6), true),
    ],
    settings: { company: "Harbor & Hill Drayage", perdiemFee: 185, freeDays: 4 },
  };
}
function mkLoad(container, brokerId, driverId, origin, dest, rate, status, pickedUp, lastFreeDay, invoiced) {
  return {
    id: "ld_" + Math.random().toString(36).slice(2, 9),
    container,
    brokerId,
    driverId,
    origin,
    dest,
    rate,
    status,
    pickedUp,
    lastFreeDay,
    invoiced,
    podAttached: status === "delivered" || status === "invoiced",
    createdAt: Date.now(),
    notes: "",
  };
}

// ---------- Date / free-time logic (the signature) ----------
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  return Math.ceil((target - now) / 86400000);
}
function addDays(dateStr, n) {
  if (!dateStr || !Number.isFinite(Number(n))) return dateStr;
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + Number(n));
  return d.toISOString().slice(0, 10);
}
function freeTimeState(load) {
  if (["invoiced"].includes(load.status)) return { tone: "done", label: "Closed", days: null };
  if (load.status === "delivered") {
    // empty return clock could still matter, but keep simple: delivered = safe unless overdue
  }
  const d = daysUntil(load.lastFreeDay);
  if (d === null) return { tone: "none", label: "—", days: null };
  if (d < 0) return { tone: "over", label: `${Math.abs(d)}d over`, days: d };
  if (d === 0) return { tone: "danger", label: "Last free day", days: 0 };
  if (d <= 2) return { tone: "warn", label: `${d}d left`, days: d };
  return { tone: "ok", label: `${d}d left`, days: d };
}
const toneColor = {
  ok: C.teal,
  warn: C.amber,
  danger: C.vermillion,
  over: C.vermillion,
  done: C.steelDim,
  none: C.steelDim,
};

// ---------- Small UI atoms ----------
function Pill({ children, color, bg, title }) {
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11,
      fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase",
      color: color || C.navy, background: bg || "rgba(255,255,255,.08)",
      padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function IconBtn({ onClick, children, title, danger }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "transparent", border: `1px solid ${danger ? "rgba(216,73,43,.4)" : C.line}`,
      color: danger ? C.vermillion : C.steel, borderRadius: 8, padding: "6px 10px",
      cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all .15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "rgba(216,73,43,.12)" : "rgba(143,163,173,.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >{children}</button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.steelDim, marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = {
  width: "100%", background: C.navy, border: `1px solid ${C.line}`, color: C.deck,
  borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box",
};

// ---------- Modal ----------
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(4,12,17,.72)", zIndex: 100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 16,
        width: "100%", maxWidth: wide ? 640 : 460, boxShadow: "0 30px 80px rgba(0,0,0,.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ margin: 0, fontSize: 18, color: C.deck, fontWeight: 700, letterSpacing: "-.01em" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.steel, fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

// ---------- Gear icon (left rail) ----------
function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z" />
    </svg>
  );
}

// ---------- Settings modal ----------
function SettingsModal({ settings, onSave, onClose }) {
  const [company, setCompany] = useState(settings.company ?? "");
  const [perdiemFee, setPerdiemFee] = useState(settings.perdiemFee ?? 0);
  const [freeDays, setFreeDays] = useState(settings.freeDays ?? 0);

  const valid = String(company).trim().length > 0;
  const fee = Number(perdiemFee);
  const days = Number(freeDays);
  const numbersValid = Number.isFinite(fee) && fee >= 0 && Number.isFinite(days) && days >= 0;

  const handleSave = () => {
    if (!valid || !numbersValid) return;
    onSave({ ...settings, company: company.trim(), perdiemFee: fee, freeDays: days });
  };

  return (
    <Modal open onClose={onClose} title="Settings">
      <Field label="Company name">
        <input style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Harbor & Hill Drayage" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="Per-diem daily fee (USD)">
          <input type="number" min="0" step="1" style={inputStyle} value={perdiemFee}
            onChange={(e) => setPerdiemFee(e.target.value)} placeholder="185" />
        </Field>
        <Field label="Default free days">
          <input type="number" min="0" step="1" style={inputStyle} value={freeDays}
            onChange={(e) => setFreeDays(e.target.value)} placeholder="4" />
        </Field>
      </div>
      <p style={{ fontSize: 12, color: C.steelDim, margin: "0 0 16px", lineHeight: 1.55 }}>
        The per-diem fee drives the dollar exposure math on the Free-time watch screen — it recalculates as soon as
        you save. Default free days sets the initial last-free-day for newly added loads.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <IconBtn onClick={onClose}>Cancel</IconBtn>
        <button disabled={!valid || !numbersValid} onClick={handleSave}
          style={{ ...primaryBtn, opacity: (valid && numbersValid) ? 1 : .4, cursor: (valid && numbersValid) ? "pointer" : "not-allowed" }}>
          Save settings
        </button>
      </div>
    </Modal>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================
export default function DockOS() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("board");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // load
  useEffect(() => {
    (async () => {
      const saved = await store.get(KEY);
      const defaults = seed();
      if (saved) {
        try {
          const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
          setData({ ...parsed, settings: { ...defaults.settings, ...(parsed.settings || {}) } });
        } catch { setData(defaults); }
      } else {
        setData(defaults);
      }
      setLoaded(true);
    })();
  }, []);

  // persist
  useEffect(() => {
    if (loaded && data) store.set(KEY, JSON.stringify(data));
  }, [data, loaded]);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  if (!loaded || !data) {
    return <div style={{ minHeight: "100vh", background: C.navy, display: "grid", placeItems: "center", color: C.steel, fontFamily: "system-ui" }}>Loading the yard…</div>;
  }

  const nav = [
    { key: "board", label: "Dispatch board", sub: "Active loads" },
    { key: "perdiem", label: "Free-time watch", sub: "Per-diem alerts" },
    { key: "brokers", label: "Brokers", sub: "Who pays, who stalls" },
    { key: "drivers", label: "Drivers", sub: "Your trucks" },
    { key: "billing", label: "Billing", sub: "Invoice & revenue" },
    { key: "compliance", label: "CARB / ZEV", sub: "Clean Trucks status" },
  ];

  const fonts = `
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
  `;

  return (
    <div style={{ minHeight: "100vh", background: C.navy, color: C.deck, fontFamily: "'Inter', system-ui, sans-serif", display: "flex" }}>
      <style>{fonts}</style>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        .dockos-card { transition: transform .14s ease, box-shadow .14s ease, border-color .14s; }
        .dockos-card:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(0,0,0,.35); }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 2px solid ${C.amber}; outline-offset: 2px;
        }
        @media (max-width: 860px) {
          .dockos-rail { position: fixed !important; left: 0; top: 0; bottom: 0; z-index: 60;
            transform: translateX(-104%); transition: transform .2s ease; box-shadow: 0 0 60px rgba(0,0,0,.6); }
          .dockos-rail.open { transform: translateX(0); }
          .dockos-hamburger { display: inline-flex !important; }
          .dockos-scrim { display: block !important; }
        }
      `}</style>

      {/* Mobile scrim */}
      {navOpen && (
        <div className="dockos-scrim" onClick={() => setNavOpen(false)} style={{
          display: "none", position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 55,
        }} />
      )}

      {/* ---------- Left rail ---------- */}
      <aside className={`dockos-rail ${navOpen ? "open" : ""}`} style={{
        width: 246, background: C.navy2, borderRight: `1px solid ${C.line}`,
        padding: "22px 16px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4,
      }}>
        <BrandMark />
        <nav style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 3 }}>
          {nav.map((n) => {
            const on = view === n.key;
            return (
              <button key={n.key} onClick={() => { setView(n.key); setNavOpen(false); }} style={{
                textAlign: "left", background: on ? C.panel : "transparent",
                border: `1px solid ${on ? C.line : "transparent"}`, borderRadius: 10,
                padding: "10px 12px", cursor: "pointer", color: on ? C.deck : C.steel,
                display: "flex", flexDirection: "column", gap: 1, transition: "all .14s",
                borderLeft: on ? `3px solid ${C.amber}` : "3px solid transparent",
              }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "rgba(143,163,173,.07)"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em" }}>{n.label}</span>
                <span style={{ fontSize: 11, color: C.steelDim }}>{n.sub}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
          <button onClick={() => { setSettingsOpen(true); setNavOpen(false); }} title="Settings" style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "transparent", border: `1px solid ${C.line}`, color: C.steel,
            borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 12,
            fontWeight: 600, marginBottom: 12, transition: "all .14s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(143,163,173,.08)"; e.currentTarget.style.color = C.deck; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.steel; }}
          >
            <GearIcon /> Settings
          </button>
          <div style={{ fontSize: 11, color: C.steelDim, lineHeight: 1.5 }}>
            <div style={{ color: C.steel, fontWeight: 600 }}>{data.settings.company}</div>
            <div>San Pedro Bay · {data.drivers.filter(d => d.active).length} trucks active</div>
          </div>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar
          view={view}
          onHamburger={() => setNavOpen(true)}
          data={data}
        />
        <div style={{ padding: "26px clamp(16px, 4vw, 40px) 60px", flex: 1 }}>
          {view === "board" && <BoardView data={data} setData={setData} flash={flash} />}
          {view === "perdiem" && <PerDiemView data={data} setData={setData} flash={flash} setView={setView} />}
          {view === "brokers" && <BrokersView data={data} setData={setData} flash={flash} />}
          {view === "drivers" && <DriversView data={data} setData={setData} flash={flash} />}
          {view === "billing" && <BillingView data={data} setData={setData} flash={flash} />}
          {view === "compliance" && <ComplianceView data={data} setData={setData} flash={flash} />}
        </div>
      </main>

      {/* Settings */}
      {settingsOpen && (
        <SettingsModal
          settings={data.settings}
          onSave={(next) => {
            setData(d => ({ ...d, settings: next }));
            flash("Settings saved.");
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200,
          background: C.panel, border: `1px solid ${C.amber}`, color: C.deck, padding: "12px 20px",
          borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: "0 14px 40px rgba(0,0,0,.5)",
        }}>{toast}</div>
      )}
    </div>
  );
}

// ---------- Brand ----------
function BrandMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 9, background: C.amber, position: "relative", flexShrink: 0,
        boxShadow: "0 4px 14px rgba(232,163,61,.35)",
      }}>
        {/* stacked container glyph */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, padding: "8px 7px" }}>
          <div style={{ height: 6, background: C.navy, borderRadius: 1 }} />
          <div style={{ height: 6, background: C.navy, borderRadius: 1, opacity: .7 }} />
          <div style={{ height: 6, background: C.navy, borderRadius: 1, opacity: .45 }} />
        </div>
      </div>
      <div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: ".02em", lineHeight: 1, color: C.deck }}>
          DOCK<span style={{ color: C.amber }}>OS</span>
        </div>
        <div style={{ fontSize: 9.5, letterSpacing: ".22em", color: C.steelDim, fontWeight: 600, marginTop: 3 }}>DRAYAGE OPERATIONS</div>
      </div>
    </div>
  );
}

// ---------- Top bar ----------
function TopBar({ view, onHamburger, data }) {
  const titles = {
    board: "Dispatch board", perdiem: "Free-time watch", brokers: "Brokers",
    drivers: "Drivers", billing: "Billing", compliance: "CARB / ZEV compliance",
  };
  // count of at-risk containers
  const atRisk = data.loads.filter(l => {
    const s = freeTimeState(l);
    return s.tone === "danger" || s.tone === "over";
  }).length;

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "16px clamp(16px, 4vw, 40px)", borderBottom: `1px solid ${C.line}`,
      background: C.navy, position: "sticky", top: 0, zIndex: 40,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button className="dockos-hamburger" onClick={onHamburger} style={{
          display: "none", background: "transparent", border: `1px solid ${C.line}`,
          color: C.steel, borderRadius: 8, padding: "8px 11px", cursor: "pointer", fontSize: 16,
        }}>☰</button>
        <h1 style={{ margin: 0, fontFamily: "'Oswald', sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: ".01em", color: C.deck }}>
          {titles[view]}
        </h1>
      </div>
      {atRisk > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, background: "rgba(216,73,43,.13)",
          border: `1px solid rgba(216,73,43,.4)`, borderRadius: 999, padding: "6px 14px",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: C.vermillion, boxShadow: `0 0 8px ${C.vermillion}` }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.deck }}>{atRisk} container{atRisk > 1 ? "s" : ""} at risk</span>
        </div>
      )}
    </header>
  );
}

// ============================================================================
// DISPATCH BOARD
// ============================================================================
function BoardView({ data, setData, flash }) {
  const [editing, setEditing] = useState(null); // load object or "new"
  const brokerById = (id) => data.brokers.find(b => b.id === id);
  const driverById = (id) => data.drivers.find(d => d.id === id);

  const moveLoad = (loadId, newStatus) => {
    setData(d => ({
      ...d,
      loads: d.loads.map(l => l.id === loadId ? {
        ...l,
        status: newStatus,
        invoiced: newStatus === "invoiced" ? true : l.invoiced,
        podAttached: ["delivered", "invoiced"].includes(newStatus) ? true : l.podAttached,
      } : l),
    }));
  };

  const saveLoad = (load) => {
    if (load.id) {
      setData(d => ({ ...d, loads: d.loads.map(l => l.id === load.id ? load : l) }));
      flash("Load updated.");
    } else {
      const nl = { ...load, id: "ld_" + Math.random().toString(36).slice(2, 9), createdAt: Date.now() };
      setData(d => ({ ...d, loads: [nl, ...d.loads] }));
      flash(`Container ${load.container} added to the board.`);
    }
    setEditing(null);
  };

  const delLoad = (id) => {
    setData(d => ({ ...d, loads: d.loads.filter(l => l.id !== id) }));
    flash("Load removed.");
  };

  const active = data.loads.filter(l => l.status !== "invoiced");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <p style={{ margin: 0, color: C.steel, fontSize: 14, maxWidth: 520 }}>
          Every container you're moving, on one board. Drag a card forward as the job progresses — no more digging through texts.
        </p>
        <button onClick={() => setEditing("new")} style={primaryBtn}>+ New load</button>
      </div>

      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 16, alignItems: "flex-start" }}>
        {STATUSES.map(col => {
          const cards = active.filter(l => l.status === col.key);
          return (
            <div key={col.key} style={{
              minWidth: 268, width: 268, flexShrink: 0, background: C.navy2,
              border: `1px solid ${C.line}`, borderRadius: 14, padding: 12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, padding: "2px 4px" }}>
                <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: C.deck }}>{col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.steelDim }}>{cards.length}</span>
              </div>
              <div style={{ fontSize: 10.5, color: C.steelDim, marginBottom: 10, padding: "0 4px" }}>{col.hint}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 40 }}>
                {cards.length === 0 && (
                  <div style={{ fontSize: 12, color: C.steelDim, fontStyle: "italic", padding: "10px 4px", opacity: .6 }}>Nothing here.</div>
                )}
                {cards.map(l => (
                  <LoadCard key={l.id} load={l} broker={brokerById(l.brokerId)} driver={driverById(l.driverId)}
                    onEdit={() => setEditing(l)} onMove={moveLoad} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <LoadEditor
          load={editing === "new" ? null : editing}
          data={data}
          onSave={saveLoad}
          onDelete={delLoad}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LoadCard({ load, broker, driver, onEdit, onMove }) {
  const ft = freeTimeState(load);
  const idx = STATUSES.findIndex(s => s.key === load.status);
  const next = STATUSES[idx + 1];
  return (
    <div className="dockos-card" style={{
      background: C.panel, border: `1px solid ${C.line}`, borderRadius: 11, padding: 12,
      borderTop: `3px solid ${toneColor[ft.tone]}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <button onClick={onEdit} style={{
          background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: C.deck, letterSpacing: ".02em",
        }}>{load.container}</button>
        {ft.days !== null && (
          <Pill bg={ft.tone === "ok" ? "rgba(63,167,150,.16)" : ft.tone === "warn" ? "rgba(232,163,61,.16)" : "rgba(216,73,43,.18)"}
            color={toneColor[ft.tone]} title="Free time before per-diem charges hit">
            {ft.label}
          </Pill>
        )}
      </div>
      <div style={{ marginTop: 9, fontSize: 12, color: C.steel, lineHeight: 1.5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: C.steelDim }}>{load.origin}</span>
          <span style={{ color: C.amber }}>→</span>
          <span style={{ color: C.steel }}>{load.dest}</span>
        </div>
        <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: C.steelDim }}>{driver ? driver.name.split(" ")[0] : "Unassigned"}</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.teal }}>${load.rate}</span>
        </div>
      </div>
      {broker && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: C.steelDim }}>{broker.name}</div>
      )}
      {next && (
        <button onClick={() => onMove(load.id, next.key)} style={{
          marginTop: 10, width: "100%", background: "rgba(232,163,61,.1)", border: `1px solid rgba(232,163,61,.3)`,
          color: C.amber, borderRadius: 7, padding: "6px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          letterSpacing: ".02em", transition: "all .14s",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232,163,61,.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(232,163,61,.1)"; }}
        >Move to {next.label} →</button>
      )}
    </div>
  );
}

function LoadEditor({ load, data, onSave, onDelete, onClose }) {
  const [f, setF] = useState(load || {
    container: "", brokerId: data.brokers[0]?.id || "", driverId: "", origin: "", dest: "",
    rate: "", status: "booked", pickedUp: TODAY(),
    lastFreeDay: addDays(TODAY(), data.settings?.freeDays ?? 0),
    invoiced: false, podAttached: false, notes: "",
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.container.trim() && f.origin.trim() && f.dest.trim();

  return (
    <Modal open onClose={onClose} title={load ? "Edit load" : "New load"} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Container number">
            <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".05em", textTransform: "uppercase" }}
              value={f.container} onChange={(e) => set("container", e.target.value.toUpperCase())} placeholder="MSCU 000000 0" />
          </Field>
        </div>
        <Field label="Origin (terminal / pier)">
          <input style={inputStyle} value={f.origin} onChange={(e) => set("origin", e.target.value)} placeholder="TTI (Pier T)" />
        </Field>
        <Field label="Destination">
          <input style={inputStyle} value={f.dest} onChange={(e) => set("dest", e.target.value)} placeholder="Carson DC" />
        </Field>
        <Field label="Broker / customer">
          <select style={inputStyle} value={f.brokerId} onChange={(e) => set("brokerId", e.target.value)}>
            <option value="">— none —</option>
            {data.brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Driver">
          <select style={inputStyle} value={f.driverId} onChange={(e) => set("driverId", e.target.value)}>
            <option value="">— unassigned —</option>
            {data.drivers.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name} · {d.truck}</option>)}
          </select>
        </Field>
        <Field label="Rate (USD)">
          <input type="number" style={inputStyle} value={f.rate} onChange={(e) => set("rate", e.target.value === "" ? "" : Number(e.target.value))} placeholder="525" />
        </Field>
        <Field label="Status">
          <select style={inputStyle} value={f.status} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Picked up">
          <input type="date" style={inputStyle} value={f.pickedUp} onChange={(e) => set("pickedUp", e.target.value)} />
        </Field>
        <Field label="Last free day (per-diem clock)">
          <input type="date" style={inputStyle} value={f.lastFreeDay} onChange={(e) => set("lastFreeDay", e.target.value)} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Notes">
            <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Chassis pool, appointment window, special handling…" />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: C.steel, cursor: "pointer", marginBottom: 6 }}>
            <input type="checkbox" checked={f.podAttached} onChange={(e) => set("podAttached", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.amber }} />
            Proof of delivery (POD) on file
          </label>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 10 }}>
        {load ? <IconBtn danger onClick={() => { onDelete(load.id); onClose(); }}>Delete load</IconBtn> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <IconBtn onClick={onClose}>Cancel</IconBtn>
          <button disabled={!valid} onClick={() => onSave(f)} style={{ ...primaryBtn, opacity: valid ? 1 : .4, cursor: valid ? "pointer" : "not-allowed" }}>
            {load ? "Save changes" : "Add load"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// PER-DIEM / FREE-TIME WATCH  (the signature feature)
// ============================================================================
function PerDiemView({ data, setData, flash, setView }) {
  const fee = data.settings.perdiemFee;
  const watched = data.loads
    .filter(l => l.status !== "invoiced")
    .map(l => ({ l, ft: freeTimeState(l) }))
    .filter(x => x.ft.days !== null)
    .sort((a, b) => (a.ft.days ?? 99) - (b.ft.days ?? 99));

  const danger = watched.filter(x => x.ft.tone === "danger" || x.ft.tone === "over");
  const warn = watched.filter(x => x.ft.tone === "warn");
  const safe = watched.filter(x => x.ft.tone === "ok");

  // exposure: sum of per-diem fees that would accrue if every overdue container sits one more day,
  // plus today's charges on overdue ones
  const overdueDays = watched.reduce((sum, x) => sum + (x.ft.days < 0 ? Math.abs(x.ft.days) : 0), 0);
  const exposureToday = overdueDays * fee;
  const brokerById = (id) => data.brokers.find(b => b.id === id);
  const driverById = (id) => data.drivers.find(d => d.id === id);

  return (
    <div>
      <p style={{ margin: "0 0 22px", color: C.steel, fontSize: 14, maxWidth: 620 }}>
        The clock that pays for the whole system. Terminals charge per-diem once a container sits past its free days —
        usually <strong style={{ color: C.deck }}>${fee}/day</strong>. This board flags containers before that happens.
      </p>

      {/* Exposure banner */}
      <div style={{
        background: overdueDays > 0 ? "rgba(216,73,43,.1)" : "rgba(63,167,150,.08)",
        border: `1px solid ${overdueDays > 0 ? "rgba(216,73,43,.4)" : "rgba(63,167,150,.3)"}`,
        borderRadius: 14, padding: "18px 22px", marginBottom: 26,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: C.steelDim }}>Per-diem accrued so far</div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 40, fontWeight: 700, color: overdueDays > 0 ? C.vermillion : C.teal, lineHeight: 1.1, marginTop: 2 }}>
            ${exposureToday.toLocaleString()}
          </div>
          <div style={{ fontSize: 12.5, color: C.steel, marginTop: 2 }}>
            {overdueDays > 0
              ? `${overdueDays} overdue container-day${overdueDays > 1 ? "s" : ""} × $${fee}. Return these empties first.`
              : "Nothing overdue. Keep it that way."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <Stat n={danger.length} label="Critical" color={C.vermillion} />
          <Stat n={warn.length} label="Watch" color={C.amber} />
          <Stat n={safe.length} label="Clear" color={C.teal} />
        </div>
      </div>

      {watched.length === 0 && (
        <Empty title="No containers on the clock" body="When you add a load with a last-free-day, it shows up here." action="Go to dispatch board" onAction={() => setView("board")} />
      )}

      {/* Lists */}
      {danger.length > 0 && <FreeTimeGroup title="Act today" tone="danger" rows={danger} brokerById={brokerById} driverById={driverById} setData={setData} flash={flash} fee={fee} />}
      {warn.length > 0 && <FreeTimeGroup title="Coming up" tone="warn" rows={warn} brokerById={brokerById} driverById={driverById} setData={setData} flash={flash} fee={fee} />}
      {safe.length > 0 && <FreeTimeGroup title="Plenty of time" tone="ok" rows={safe} brokerById={brokerById} driverById={driverById} setData={setData} flash={flash} fee={fee} />}
    </div>
  );
}

function Stat({ n, label, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.steelDim, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function FreeTimeGroup({ title, tone, rows, brokerById, driverById, setData, flash, fee }) {
  const markReturned = (loadId, container) => {
    setData(d => ({ ...d, loads: d.loads.map(l => l.id === loadId ? { ...l, status: "delivered", lastFreeDay: "" } : l) }));
    flash(`${container} marked returned — clock stopped.`);
  };
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: toneColor[tone] }} />
        <h3 style={{ margin: 0, fontFamily: "'Oswald',sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: C.deck }}>{title}</h3>
        <span style={{ fontSize: 12, color: C.steelDim }}>({rows.length})</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map(({ l, ft }) => {
          const broker = brokerById(l.brokerId);
          const driver = driverById(l.driverId);
          const accrued = ft.days < 0 ? Math.abs(ft.days) * fee : 0;
          return (
            <div key={l.id} className="dockos-card" style={{
              background: C.navy2, border: `1px solid ${C.line}`, borderLeft: `4px solid ${toneColor[ft.tone]}`,
              borderRadius: 11, padding: "14px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            }}>
              <div style={{ minWidth: 130 }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: C.deck }}>{l.container}</div>
                <div style={{ fontSize: 11.5, color: C.steelDim, marginTop: 2 }}>{broker ? broker.name : "No broker"}</div>
              </div>
              <div style={{ flex: 1, minWidth: 160, fontSize: 12.5, color: C.steel }}>
                <div>{l.origin} <span style={{ color: C.amber }}>→</span> {l.dest}</div>
                <div style={{ color: C.steelDim, marginTop: 2 }}>{driver ? driver.name : "Unassigned"} · last free {l.lastFreeDay || "—"}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 96 }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, color: toneColor[ft.tone], lineHeight: 1 }}>{ft.label}</div>
                {accrued > 0 && <div style={{ fontSize: 11.5, color: C.vermillion, fontWeight: 700, marginTop: 3 }}>−${accrued.toLocaleString()} so far</div>}
              </div>
              <button onClick={() => markReturned(l.id, l.container)} style={{
                background: "rgba(63,167,150,.12)", border: `1px solid rgba(63,167,150,.4)`, color: C.teal,
                borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}>Mark empty returned</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// BROKERS
// ============================================================================
function BrokersView({ data, setData, flash }) {
  const [editing, setEditing] = useState(null);

  const loadsFor = (id) => data.loads.filter(l => l.brokerId === id);
  const revenueFor = (id) => loadsFor(id).reduce((s, l) => s + (Number(l.rate) || 0), 0);

  const save = (b) => {
    if (b.id) {
      setData(d => ({ ...d, brokers: d.brokers.map(x => x.id === b.id ? b : x) }));
      flash("Broker updated.");
    } else {
      setData(d => ({ ...d, brokers: [...d.brokers, { ...b, id: "brk_" + Math.random().toString(36).slice(2, 8) }] }));
      flash("Broker added.");
    }
    setEditing(null);
  };
  const del = (id) => { setData(d => ({ ...d, brokers: d.brokers.filter(b => b.id !== id) })); flash("Broker removed."); setEditing(null); };

  const ratingMeta = {
    fast: { label: "Fast pay", color: C.teal, bg: "rgba(63,167,150,.15)" },
    ok: { label: "On time", color: C.amber, bg: "rgba(232,163,61,.15)" },
    slow: { label: "Slow pay", color: C.vermillion, bg: "rgba(216,73,43,.15)" },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <p style={{ margin: 0, color: C.steel, fontSize: 14, maxWidth: 540 }}>
          Your memory, written down. Which brokers pay on time, which stall, and what each one is worth to you.
        </p>
        <button onClick={() => setEditing("new")} style={primaryBtn}>+ Add broker</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {data.brokers.map(b => {
          const r = ratingMeta[b.rating] || ratingMeta.ok;
          const n = loadsFor(b.id).length;
          return (
            <div key={b.id} className="dockos-card" onClick={() => setEditing(b)} style={{
              background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.deck, letterSpacing: "-.01em" }}>{b.name}</div>
                  <div style={{ fontSize: 12.5, color: C.steelDim, marginTop: 2 }}>{b.contact} · {b.phone}</div>
                </div>
                <Pill color={r.color} bg={r.bg}>{r.label}</Pill>
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
                <div>
                  <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, color: C.deck, lineHeight: 1 }}>{b.payDays}</div>
                  <div style={{ fontSize: 10.5, color: C.steelDim, textTransform: "uppercase", letterSpacing: ".05em", marginTop: 3 }}>avg days to pay</div>
                </div>
                <div>
                  <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, color: C.teal, lineHeight: 1 }}>${revenueFor(b.id).toLocaleString()}</div>
                  <div style={{ fontSize: 10.5, color: C.steelDim, textTransform: "uppercase", letterSpacing: ".05em", marginTop: 3 }}>booked · {n} load{n !== 1 ? "s" : ""}</div>
                </div>
              </div>
              {b.notes && <div style={{ marginTop: 14, fontSize: 12.5, color: C.steel, lineHeight: 1.5, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>{b.notes}</div>}
            </div>
          );
        })}
      </div>

      {editing && <BrokerEditor broker={editing === "new" ? null : editing} onSave={save} onDelete={del} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BrokerEditor({ broker, onSave, onDelete, onClose }) {
  const [f, setF] = useState(broker || { name: "", contact: "", phone: "", payDays: 30, rating: "ok", notes: "" });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.name.trim();
  return (
    <Modal open onClose={onClose} title={broker ? "Edit broker" : "Add broker"}>
      <Field label="Company name"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Pacific Rim Forwarding" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="Contact"><input style={inputStyle} value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Lena Ortiz" /></Field>
        <Field label="Phone"><input style={inputStyle} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(213) 555-0110" /></Field>
        <Field label="Avg days to pay"><input type="number" style={inputStyle} value={f.payDays} onChange={(e) => set("payDays", Number(e.target.value))} /></Field>
        <Field label="Pay rating">
          <select style={inputStyle} value={f.rating} onChange={(e) => set("rating", e.target.value)}>
            <option value="fast">Fast pay</option>
            <option value="ok">On time</option>
            <option value="slow">Slow pay</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Rate quirks, dispute history, preferred lanes…" /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {broker ? <IconBtn danger onClick={() => onDelete(broker.id)}>Delete</IconBtn> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <IconBtn onClick={onClose}>Cancel</IconBtn>
          <button disabled={!valid} onClick={() => onSave(f)} style={{ ...primaryBtn, opacity: valid ? 1 : .4 }}>{broker ? "Save" : "Add broker"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// DRIVERS
// ============================================================================
function DriversView({ data, setData, flash }) {
  const [editing, setEditing] = useState(null);
  const activeLoadsFor = (id) => data.loads.filter(l => l.driverId === id && l.status !== "invoiced").length;

  const save = (dr) => {
    if (dr.id) { setData(d => ({ ...d, drivers: d.drivers.map(x => x.id === dr.id ? dr : x) })); flash("Driver updated."); }
    else { setData(d => ({ ...d, drivers: [...d.drivers, { ...dr, id: "drv_" + Math.random().toString(36).slice(2, 8) }] })); flash("Driver added."); }
    setEditing(null);
  };
  const del = (id) => { setData(d => ({ ...d, drivers: d.drivers.filter(x => x.id !== id) })); flash("Driver removed."); setEditing(null); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <p style={{ margin: 0, color: C.steel, fontSize: 14, maxWidth: 540 }}>Your trucks and who's behind the wheel. ZEV-tagged trucks are flagged for the Clean Trucks board.</p>
        <button onClick={() => setEditing("new")} style={primaryBtn}>+ Add driver</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {data.drivers.map(dr => {
          const load = activeLoadsFor(dr.id);
          const zev = /zev/i.test(dr.truck);
          return (
            <div key={dr.id} className="dockos-card" onClick={() => setEditing(dr)} style={{
              background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, cursor: "pointer",
              opacity: dr.active ? 1 : .55,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: C.panel, display: "grid", placeItems: "center",
                  fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 700, color: C.amber, flexShrink: 0,
                }}>{dr.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.deck }}>{dr.name}</div>
                  <div style={{ fontSize: 12, color: C.steelDim }}>{dr.phone}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: C.steel }}>{dr.truck.replace(/ ·.*/, "")}</span>
                  {zev && <Pill color={C.teal} bg="rgba(63,167,150,.15)">ZEV</Pill>}
                </div>
                <Pill color={load > 0 ? C.amber : C.steelDim} bg={load > 0 ? "rgba(232,163,61,.13)" : "rgba(143,163,173,.1)"}>{load} active</Pill>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <DriverEditor driver={editing === "new" ? null : editing} onSave={save} onDelete={del} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DriverEditor({ driver, onSave, onDelete, onClose }) {
  const [f, setF] = useState(driver || { name: "", phone: "", truck: "", active: true });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.name.trim();
  return (
    <Modal open onClose={onClose} title={driver ? "Edit driver" : "Add driver"}>
      <Field label="Name"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Marco Reyes" /></Field>
      <Field label="Phone"><input style={inputStyle} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(562) 555-0142" /></Field>
      <Field label="Truck (add “ZEV” to tag it electric)"><input style={inputStyle} value={f.truck} onChange={(e) => set("truck", e.target.value)} placeholder="Truck 1 · ZEV" /></Field>
      <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: C.steel, cursor: "pointer", marginBottom: 8 }}>
        <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.amber }} />
        Active (available for dispatch)
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {driver ? <IconBtn danger onClick={() => onDelete(driver.id)}>Delete</IconBtn> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <IconBtn onClick={onClose}>Cancel</IconBtn>
          <button disabled={!valid} onClick={() => onSave(f)} style={{ ...primaryBtn, opacity: valid ? 1 : .4 }}>{driver ? "Save" : "Add driver"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// BILLING
// ============================================================================
function BillingView({ data, setData, flash }) {
  const brokerById = (id) => data.brokers.find(b => b.id === id);
  const driverById = (id) => data.drivers.find(d => d.id === id);

  const delivered = data.loads.filter(l => l.status === "delivered");
  const invoiced = data.loads.filter(l => l.status === "invoiced");
  const readyRevenue = delivered.reduce((s, l) => s + (Number(l.rate) || 0), 0);
  const invoicedRevenue = invoiced.reduce((s, l) => s + (Number(l.rate) || 0), 0);
  const monthRevenue = data.loads.reduce((s, l) => s + (Number(l.rate) || 0), 0);

  const [invoicePreview, setInvoicePreview] = useState(null);

  const sendInvoice = (l) => {
    setData(d => ({ ...d, loads: d.loads.map(x => x.id === l.id ? { ...x, status: "invoiced", invoiced: true } : x) }));
    flash(`Invoice for ${l.container} generated.`);
    setInvoicePreview(null);
  };

  return (
    <div>
      <p style={{ margin: "0 0 22px", color: C.steel, fontSize: 14, maxWidth: 600 }}>
        Turn a delivered container into an invoice in one tap. No retyping — it pulls the lane, rate, and POD straight off the load card.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <MetricCard label="Ready to invoice" value={`$${readyRevenue.toLocaleString()}`} sub={`${delivered.length} delivered`} accent={C.amber} />
        <MetricCard label="Invoiced" value={`$${invoicedRevenue.toLocaleString()}`} sub={`${invoiced.length} sent`} accent={C.teal} />
        <MetricCard label="Total booked" value={`$${monthRevenue.toLocaleString()}`} sub={`${data.loads.length} loads`} accent={C.steel} />
      </div>

      <SectionTitle>Ready to invoice</SectionTitle>
      {delivered.length === 0
        ? <MutedRow>Nothing delivered and waiting. Move a load to “Delivered” on the board.</MutedRow>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 28 }}>
            {delivered.map(l => {
              const broker = brokerById(l.brokerId);
              return (
                <div key={l.id} style={billingRow}>
                  <div style={{ minWidth: 120 }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.deck }}>{l.container}</div>
                    <div style={{ fontSize: 11.5, color: C.steelDim }}>{broker ? broker.name : "No broker"}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 140, fontSize: 12.5, color: C.steel }}>{l.origin} → {l.dest}</div>
                  <div>{l.podAttached
                    ? <Pill color={C.teal} bg="rgba(63,167,150,.14)">POD ✓</Pill>
                    : <Pill color={C.vermillion} bg="rgba(216,73,43,.14)">No POD</Pill>}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.teal, minWidth: 70, textAlign: "right" }}>${l.rate}</div>
                  <button onClick={() => setInvoicePreview(l)} style={{ ...primaryBtn, padding: "8px 14px", fontSize: 12.5 }}>Generate invoice</button>
                </div>
              );
            })}
          </div>
        )}

      <SectionTitle>Invoiced</SectionTitle>
      {invoiced.length === 0
        ? <MutedRow>No invoices sent yet.</MutedRow>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {invoiced.map(l => {
              const broker = brokerById(l.brokerId);
              return (
                <div key={l.id} style={{ ...billingRow, opacity: .8 }}>
                  <div style={{ minWidth: 120 }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.deck }}>{l.container}</div>
                    <div style={{ fontSize: 11.5, color: C.steelDim }}>{broker ? broker.name : "No broker"}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 140, fontSize: 12.5, color: C.steel }}>{l.origin} → {l.dest}</div>
                  <Pill color={C.teal} bg="rgba(63,167,150,.14)">Invoiced</Pill>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.steelDim, minWidth: 70, textAlign: "right" }}>${l.rate}</div>
                  <button onClick={() => setInvoicePreview(l)} style={{ ...ghostBtn, padding: "8px 14px", fontSize: 12.5 }}>View</button>
                </div>
              );
            })}
          </div>
        )}

      {invoicePreview && (
        <InvoiceModal
          load={invoicePreview}
          broker={brokerById(invoicePreview.brokerId)}
          driver={driverById(invoicePreview.driverId)}
          company={data.settings.company}
          alreadySent={invoicePreview.status === "invoiced"}
          onSend={() => sendInvoice(invoicePreview)}
          onClose={() => setInvoicePreview(null)}
        />
      )}
    </div>
  );
}

function InvoiceModal({ load, broker, driver, company, onSend, onClose, alreadySent }) {
  const invNo = "INV-" + load.container.replace(/[^A-Z0-9]/g, "").slice(-6);
  return (
    <Modal open onClose={onClose} title={alreadySent ? "Invoice" : "Generate invoice"} wide>
      <div style={{ background: C.deck, color: C.navy, borderRadius: 12, padding: 24, fontFamily: "'Inter',sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${C.navy}`, paddingBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: ".02em" }}>{company}</div>
            <div style={{ fontSize: 12, color: "#5E747F", marginTop: 2 }}>Drayage services · San Pedro Bay</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 18, fontWeight: 700 }}>INVOICE</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700 }}>{invNo}</div>
            <div style={{ fontSize: 12, color: "#5E747F", marginTop: 2 }}>{TODAY()}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#5E747F" }}>Bill to</div>
            <div style={{ fontWeight: 700, marginTop: 3 }}>{broker ? broker.name : "—"}</div>
            <div style={{ color: "#5E747F" }}>{broker ? `${broker.contact} · ${broker.phone}` : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#5E747F" }}>Terms</div>
            <div style={{ fontWeight: 700, marginTop: 3 }}>NET {broker ? broker.payDays : 30}</div>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid #cfd8dc`, textAlign: "left" }}>
              <th style={{ padding: "8px 0", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#5E747F" }}>Description</th>
              <th style={{ padding: "8px 0", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#5E747F", textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: `1px solid #e4e9eb` }}>
              <td style={{ padding: "10px 0" }}>
                <div style={{ fontWeight: 700 }}>Drayage — container {load.container}</div>
                <div style={{ color: "#5E747F", fontSize: 12 }}>{load.origin} → {load.dest} · picked up {load.pickedUp}</div>
                {driver && <div style={{ color: "#5E747F", fontSize: 12 }}>Driver: {driver.name}</div>}
              </td>
              <td style={{ padding: "10px 0", textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>${Number(load.rate).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <div style={{ minWidth: 180 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, borderTop: `2px solid ${C.navy}`, paddingTop: 10 }}>
              <span>Total due</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>${Number(load.rate).toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 11.5, color: "#5E747F", display: "flex", alignItems: "center", gap: 6 }}>
          {load.podAttached ? "✓ Proof of delivery attached" : "⚠ No POD attached — attach before sending to avoid disputes"}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <IconBtn onClick={onClose}>Close</IconBtn>
        {!alreadySent && <button onClick={onSend} style={primaryBtn}>Mark invoiced</button>}
      </div>
    </Modal>
  );
}

// ============================================================================
// CARB / ZEV COMPLIANCE
// ============================================================================
function ComplianceView({ data, setData, flash }) {
  // Compliance items keyed off drivers/trucks
  const [items, setItems] = useState(null);

  useEffect(() => {
    // derive a compliance row per truck if not already in data
    if (data.compliance) { setItems(data.compliance); return; }
    const derived = data.drivers.map(d => ({
      id: "cmp_" + d.id,
      driverId: d.id,
      truck: d.truck,
      isZev: /zev/i.test(d.truck),
      trucrsRenewal: nextRenewal(),
      registryOk: /zev/i.test(d.truck),
    }));
    setItems(derived);
  }, [data]);

  const persist = (next) => {
    setItems(next);
    setData(d => ({ ...d, compliance: next }));
  };

  if (!items) return null;

  const zevCount = items.filter(i => i.isZev).length;
  const total = items.length;
  const pct = total ? Math.round((zevCount / total) * 100) : 0;
  const dieselCount = total - zevCount;

  const driverName = (id) => data.drivers.find(d => d.id === id)?.name || "—";

  const toggleZev = (id) => {
    persist(items.map(i => i.id === id ? { ...i, isZev: !i.isZev, registryOk: !i.isZev } : i));
    flash("Truck status updated.");
  };

  return (
    <div>
      <p style={{ margin: "0 0 8px", color: C.steel, fontSize: 14, maxWidth: 640 }}>
        California's Clean Trucks rule is real money and real deadlines. Since January 2024, newly registered drayage trucks
        must be zero-emission, and every drayage truck must be zero-emission by 2035. Track where your fleet stands.
      </p>
      <p style={{ margin: "0 0 24px", fontSize: 12, color: C.steelDim }}>
        Reference: California Air Resources Board — Advanced Clean Fleets / drayage registry (TRUCRS).
      </p>

      {/* Fleet progress */}
      <div style={{ background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22, marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: C.deck }}>Fleet toward ZEV (2035 mandate)</span>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 28, fontWeight: 700, color: C.amber }}>{pct}%</span>
        </div>
        <div style={{ height: 14, background: C.navy, borderRadius: 999, overflow: "hidden", border: `1px solid ${C.line}` }}>
          <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${C.teal}, ${C.amber})`, transition: "width .4s ease" }} />
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
          <Stat n={zevCount} label="ZEV trucks" color={C.teal} />
          <Stat n={dieselCount} label="Still diesel" color={C.amber} />
          <Stat n={total} label="Total" color={C.steel} />
        </div>
      </div>

      <SectionTitle>Per-truck status</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {items.map(i => {
          const days = daysUntil(i.trucrsRenewal);
          const soon = days !== null && days <= 45;
          return (
            <div key={i.id} className="dockos-card" style={{
              background: C.navy2, border: `1px solid ${C.line}`, borderLeft: `4px solid ${i.isZev ? C.teal : C.amber}`,
              borderRadius: 11, padding: "14px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            }}>
              <div style={{ minWidth: 150 }}>
                <div style={{ fontWeight: 700, color: C.deck }}>{i.truck.replace(/ ·.*/, "")}</div>
                <div style={{ fontSize: 12, color: C.steelDim }}>{driverName(i.driverId)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.steelDim }}>TRUCRS renewal</div>
                <div style={{ fontSize: 13, color: soon ? C.vermillion : C.steel, fontWeight: soon ? 700 : 500, marginTop: 2 }}>
                  {i.trucrsRenewal} {days !== null && `· ${days < 0 ? Math.abs(days) + "d overdue" : days + "d"}`}
                </div>
              </div>
              <div>{i.registryOk
                ? <Pill color={C.teal} bg="rgba(63,167,150,.14)">Registry ✓</Pill>
                : <Pill color={C.amber} bg="rgba(232,163,61,.14)">Check registry</Pill>}</div>
              <button onClick={() => toggleZev(i.id)} style={{
                background: i.isZev ? "rgba(232,163,61,.1)" : "rgba(63,167,150,.12)",
                border: `1px solid ${i.isZev ? "rgba(232,163,61,.35)" : "rgba(63,167,150,.4)"}`,
                color: i.isZev ? C.amber : C.teal, borderRadius: 8, padding: "8px 12px",
                fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}>{i.isZev ? "Mark as diesel" : "Mark as ZEV"}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function nextRenewal() {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random() * 120) - 20);
  return d.toISOString().slice(0, 10);
}

// ---------- Shared bits ----------
function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.steelDim }}>{label}</div>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 30, fontWeight: 700, color: C.deck, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.steel, marginTop: 3 }}>{sub}</div>
    </div>
  );
}
function SectionTitle({ children }) {
  return <h3 style={{ margin: "0 0 12px", fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: C.deck }}>{children}</h3>;
}
function MutedRow({ children }) {
  return <div style={{ background: C.navy2, border: `1px dashed ${C.line}`, borderRadius: 11, padding: "16px 18px", color: C.steelDim, fontSize: 13, marginBottom: 28 }}>{children}</div>;
}
function Empty({ title, body, action, onAction }) {
  return (
    <div style={{ background: C.navy2, border: `1px dashed ${C.line}`, borderRadius: 16, padding: "44px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 20, fontWeight: 600, color: C.deck }}>{title}</div>
      <div style={{ fontSize: 13.5, color: C.steel, marginTop: 8, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>{body}</div>
      {action && <button onClick={onAction} style={{ ...primaryBtn, marginTop: 18 }}>{action}</button>}
    </div>
  );
}

const primaryBtn = {
  background: C.amber, color: C.navy, border: "none", borderRadius: 9, padding: "10px 18px",
  fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: ".01em", fontFamily: "inherit",
  boxShadow: "0 4px 14px rgba(232,163,61,.28)",
};
const ghostBtn = {
  background: "transparent", color: C.steel, border: `1px solid ${C.line}`, borderRadius: 9,
  padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const billingRow = {
  background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 11, padding: "14px 16px",
  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
};
