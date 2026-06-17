import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2, Circle, CircleDashed, Hourglass, Phone, FileText, CalendarPlus,
  AlertTriangle, LayoutGrid, ListTodo, Paperclip, Users, ChevronLeft, Bell, Plus, ShieldCheck, X,
  Pencil, Trash2,
} from "lucide-react";
import { CATEGORIES, STATUSES, PRIORITIES } from "./config";
import * as G from "./google";

const dayMs = 1000 * 60 * 60 * 24;
const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / dayMs);
const fmt = (d) => new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
const catColor = (c) => CATEGORIES[c] || "#6E7873";

export default function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tasks, setTasks] = useState([]);
  const [config, setConfig] = useState({});
  const [tab, setTab] = useState("dash");
  const [filter, setFilter] = useState("הכל");
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);   // המשימה שנמצאת בעריכה
  const [deleting, setDeleting] = useState(null);  // המשימה שממתינה לאישור מחיקה
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    G.initGoogle().then(() => setReady(true)).catch((e) => setErr(e.message));
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  async function connect() {
    setErr("");
    try {
      await G.signIn();
      setSignedIn(true);
      await load();
    } catch (e) {
      setErr(e?.message || "ההתחברות נכשלה");
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [cfg, ts] = await Promise.all([G.readConfig(), G.readTasks()]);
      setConfig(cfg);
      setTasks(ts);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function cycleStatus(task) {
    const next = STATUSES[(STATUSES.indexOf(task.status) + 1) % STATUSES.length];
    const updated = { ...task, status: next, doneDate: next === "הושלם" ? new Date().toISOString().slice(0, 10) : "" };
    setTasks((arr) => arr.map((t) => (t._row === task._row ? updated : t)));
    if (open && open._row === task._row) setOpen(updated);
    try { await G.updateTask(updated); } catch (e) { flash("שמירה נכשלה — " + e.message); }
  }

  async function addReminder(task) {
    try {
      const eventId = await G.upsertReminder(task);
      const updated = { ...task, eventId };
      setTasks((arr) => arr.map((t) => (t._row === task._row ? updated : t)));
      if (open && open._row === task._row) setOpen(updated);
      await G.updateTask(updated);
      flash("התזכורת נוספה ליומן ✓");
    } catch (e) {
      flash("יצירת התזכורת נכשלה — " + e.message);
    }
  }

  async function saveNew(t) {
    setAdding(false);
    try {
      await G.addTask(t);
      await load();
      flash("המשימה נוספה ✓");
    } catch (e) {
      flash("ההוספה נכשלה — " + e.message);
    }
  }

  async function saveEdit(form) {
    // משמרים את השדות הנסתרים מהמשימה המקורית (_row, id, eventId)
    const orig = editing;
    const merged = { ...orig, ...form };
    // התאמת תאריך ההשלמה לסטטוס
    if (merged.status === "הושלם" && !merged.doneDate) merged.doneDate = new Date().toISOString().slice(0, 10);
    if (merged.status !== "הושלם") merged.doneDate = "";
    setEditing(null);
    setOpen(null);
    try {
      await G.updateTask(merged);
      await load();
      flash("השינויים נשמרו ✓");
    } catch (e) {
      flash("השמירה נכשלה — " + e.message);
    }
  }

  async function confirmDelete() {
    const t = deleting;
    setBusy(true);
    try {
      await G.deleteTask(t);
      setDeleting(null);
      setOpen(null);
      await load();
      flash("המשימה נמחקה");
    } catch (e) {
      flash("המחיקה נכשלה — " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- חישובים לדשבורד ---------- */
  const active = tasks.filter((t) => t.status !== "הושלם");
  const urgent = active.filter((t) => t.status !== "ממתין לגורם חיצוני" && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 14).sort((a, b) => daysUntil(a.due) - daysUntil(b.due));
  const overdue = active.filter((t) => t.due && daysUntil(t.due) < 0);
  const waiting = active.filter((t) => t.status === "ממתין לגורם חיצוני");
  const doneCount = tasks.filter((t) => t.status === "הושלם").length;

  const discharge = config.dischargeDate ? new Date(config.dischargeDate) : new Date(Date.now() + 120 * dayMs);
  const start = config.journeyStart ? new Date(config.journeyStart) : new Date(Date.now() - 90 * dayMs);
  const remaining = Math.max(0, daysUntil(discharge));
  const pct = Math.min(1, Math.max(0, (new Date() - start) / (discharge - start)));

  const progress = useMemo(() =>
    Object.keys(CATEGORIES).map((c) => {
      const all = tasks.filter((t) => t.cat === c);
      const done = all.filter((t) => t.status === "הושלם").length;
      return { cat: c, done, total: all.length, pct: all.length ? done / all.length : 0 };
    }).filter((r) => r.total > 0), [tasks]);

  const shown = filter === "הכל" ? tasks : tasks.filter((t) => t.cat === filter);
  const contacts = tasks.filter((t) => t.who).reduce((acc, t) => {
    if (!acc.find((a) => a.who === t.who)) acc.push({ who: t.who, phone: t.phone, cat: t.cat });
    return acc;
  }, []);
  const docs = tasks.filter((t) => t.docs && t.status !== "הושלם");

  /* ---------- מסך התחברות ---------- */
  if (!signedIn) {
    return (
      <div dir="rtl" className="gate">
        <div className="gate-badge"><ShieldCheck size={38} /></div>
        <h1>פרישה מצה״ל</h1>
        <p>ניהול המשימות שלך בדרך לאזרחות. הנתונים נשמרים בגיליון גוגל שלך, והתזכורות נכנסות ישירות ליומן.</p>
        <button className="gate-btn" disabled={!ready} onClick={connect}>
          {ready ? "התחברות עם גוגל" : "טוען…"}
        </button>
        {err && <div className="gate-err">{err}</div>}
      </div>
    );
  }

  return (
    <div dir="rtl" className="root">
      <header className="top">
        <div>
          <div className="kicker">המסלול שלי</div>
          <h1>פרישה מצה״ל</h1>
        </div>
        <button className="bell" onClick={load} aria-label="רענון"><Bell size={20} /></button>
      </header>

      <main className="screen">
        {loading && <div className="center">טוען נתונים מהגיליון…</div>}
        {err && !loading && <div className="empty" style={{ marginBottom: 16, color: "#C5523E" }}>{err}</div>}

        {!loading && tab === "dash" && (
          <>
            <section className="hero">
              <JourneyGauge remaining={remaining} pct={pct} />
              <div className="hero-meta">
                <span>תאריך פרישה: <b>{discharge.toLocaleDateString("he-IL")}</b></span>
                <span>{Math.round(pct * 100)}% מהדרך</span>
              </div>
            </section>

            <section className="stats">
              <StatCard icon={<AlertTriangle size={18} />} label="דורש פעולה השבוע" value={urgent.length} tone="#C98A2B" />
              <StatCard icon={<AlertTriangle size={18} />} label="באיחור" value={overdue.length} tone="#C5523E" />
              <StatCard icon={<Hourglass size={18} />} label="ממתין לגורם חיצוני" value={waiting.length} tone="#7A5C7E" />
              <StatCard icon={<CheckCircle2 size={18} />} label="הושלמו" value={doneCount} tone="#3F9D5A" />
            </section>

            {overdue.length > 0 && (
              <Block title="באיחור — לטפל ראשון" tone="#C5523E">
                {overdue.map((t) => <Row key={t._row} t={t} onStatus={cycleStatus} onOpen={setOpen} />)}
              </Block>
            )}

            <Block title="דחוף עכשיו — הכדור אצלך" tone="#C98A2B">
              {urgent.length ? urgent.map((t) => <Row key={t._row} t={t} onStatus={cycleStatus} onOpen={setOpen} />)
                : <Empty>אין משימות דחופות בשבועיים הקרובים.</Empty>}
            </Block>

            <Block title="התקדמות לפי קטגוריה" tone="#2F7E7A">
              <div className="prog-list">
                {progress.length ? progress.map((p) => (
                  <div key={p.cat} className="prog">
                    <div className="prog-head">
                      <span className="dot" style={{ background: catColor(p.cat) }} />
                      <span className="prog-name">{p.cat}</span>
                      <span className="prog-frac">{p.done}/{p.total}</span>
                    </div>
                    <div className="bar"><div style={{ width: `${p.pct * 100}%`, background: catColor(p.cat) }} /></div>
                  </div>
                )) : <Empty>אין עדיין משימות. הוסף משימה עם הכפתור למטה.</Empty>}
              </div>
            </Block>

            <Block title="ממתין לגורם חיצוני — למי לנדנד" tone="#7A5C7E">
              {waiting.length ? waiting.map((t) => <Row key={t._row} t={t} onStatus={cycleStatus} onOpen={setOpen} />)
                : <Empty>שום דבר לא תקוע אצל אחרים כרגע.</Empty>}
            </Block>
          </>
        )}

        {!loading && tab === "tasks" && (
          <>
            <div className="chips">
              {["הכל", ...Object.keys(CATEGORIES)].map((c) => (
                <button key={c} className={"chip" + (filter === c ? " chip-on" : "")}
                  style={filter === c && c !== "הכל" ? { background: catColor(c), borderColor: catColor(c) } : {}}
                  onClick={() => setFilter(c)}>{c}</button>
              ))}
            </div>
            <div className="list">
              {shown.length ? shown.map((t) => <Row key={t._row} t={t} onStatus={cycleStatus} onOpen={setOpen} />)
                : <Empty>אין משימות בקטגוריה הזו.</Empty>}
            </div>
          </>
        )}

        {!loading && tab === "docs" && (
          <Block title="צ׳קליסט מסמכים" tone="#3E6E8E">
            {docs.length ? docs.map((t) => (
              <div key={t._row} className="doc">
                <FileText size={18} style={{ color: "#3E6E8E", flexShrink: 0 }} />
                <div>
                  <div className="doc-name">{t.docs}</div>
                  <div className="doc-for">עבור: {t.title}</div>
                </div>
              </div>
            )) : <Empty>אין מסמכים פתוחים.</Empty>}
          </Block>
        )}

        {!loading && tab === "contacts" && (
          <Block title="אנשי קשר וגורמים מטפלים" tone="#6B7551">
            {contacts.length ? contacts.map((c) => (
              <div key={c.who} className="contact">
                <span className="dot" style={{ background: catColor(c.cat) }} />
                <div className="contact-name">{c.who}</div>
                {c.phone ? <a className="call" href={`tel:${c.phone}`}><Phone size={15} />{c.phone}</a>
                  : <span className="call call-off">אין טלפון</span>}
              </div>
            )) : <Empty>אין אנשי קשר עדיין.</Empty>}
          </Block>
        )}
      </main>

      <button className="fab" onClick={() => setAdding(true)} aria-label="הוספת משימה"><Plus size={24} /></button>

      <nav className="tabbar">
        <Tab id="dash" cur={tab} set={setTab} icon={<LayoutGrid size={21} />} label="דשבורד" />
        <Tab id="tasks" cur={tab} set={setTab} icon={<ListTodo size={21} />} label="משימות" />
        <Tab id="docs" cur={tab} set={setTab} icon={<Paperclip size={21} />} label="מסמכים" />
        <Tab id="contacts" cur={tab} set={setTab} icon={<Users size={21} />} label="קשר" />
      </nav>

      {open && <Detail t={open} onClose={() => setOpen(null)} onStatus={cycleStatus} onReminder={addReminder}
        onEdit={() => setEditing(open)} onDelete={() => setDeleting(open)} />}
      {adding && <TaskForm title="משימה חדשה" submitLabel="שמירת המשימה" onClose={() => setAdding(false)} onSave={saveNew} />}
      {editing && <TaskForm title="עריכת משימה" submitLabel="שמירת שינויים" initial={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}
      {deleting && <ConfirmDelete t={deleting} busy={busy} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ===================== רכיבים ===================== */

function StatusIcon({ status, size = 18 }) {
  if (status === "הושלם") return <CheckCircle2 size={size} style={{ color: "#3F9D5A" }} />;
  if (status === "בתהליך") return <CircleDashed size={size} style={{ color: "#2F7E7A" }} />;
  if (status === "ממתין לגורם חיצוני") return <Hourglass size={size} style={{ color: "#C98A2B" }} />;
  return <Circle size={size} style={{ color: "#9AA39E" }} />;
}

function JourneyGauge({ remaining, pct }) {
  const R = 88;
  const C = Math.PI * R;
  const off = C * (1 - pct);
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 118" width="100%" style={{ maxWidth: 260 }}>
        <path d="M12 108 A88 88 0 0 1 188 108" fill="none" stroke="#E2E7E3" strokeWidth="13" strokeLinecap="round" />
        <path d="M12 108 A88 88 0 0 1 188 108" fill="none" stroke="url(#g)" strokeWidth="13" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6B7551" />
            <stop offset="100%" stopColor="#2F7E7A" />
          </linearGradient>
        </defs>
      </svg>
      <div className="gauge-center">
        <div className="gauge-num">{remaining}</div>
        <div className="gauge-label">ימים לפרישה</div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }) {
  return (
    <div className="stat" style={{ borderColor: tone + "33" }}>
      <div className="stat-icon" style={{ background: tone + "1A", color: tone }}>{icon}</div>
      <div>
        <div className="stat-val">{value}</div>
        <div className="stat-lbl">{label}</div>
      </div>
    </div>
  );
}

function Block({ title, tone, children }) {
  return <section className="block"><h2 style={{ "--tone": tone }}>{title}</h2>{children}</section>;
}
function Empty({ children }) { return <div className="empty">{children}</div>; }

function Row({ t, onStatus, onOpen }) {
  const d = t.due ? daysUntil(t.due) : null;
  const late = d !== null && d < 0 && t.status !== "הושלם";
  const soon = d !== null && d >= 0 && d <= 3 && t.status !== "הושלם";
  return (
    <div className="row" onClick={() => onOpen(t)}>
      <button className="row-status" onClick={(e) => { e.stopPropagation(); onStatus(t); }} title="לחיצה משנה סטטוס">
        <StatusIcon status={t.status} />
      </button>
      <div className="row-body">
        <div className={"row-title" + (t.status === "הושלם" ? " done" : "")}>{t.title}</div>
        <div className="row-sub">
          <span className="tag" style={{ background: catColor(t.cat) + "1A", color: catColor(t.cat) }}>{t.cat}</span>
          {t.due && <span className={"due" + (late ? " late" : soon ? " soon" : "")}>
            {late ? `באיחור ${Math.abs(d)} ימים` : d === 0 ? "היום" : `בעוד ${d} ימים`} · {fmt(t.due)}
          </span>}
        </div>
      </div>
      <ChevronLeft size={18} className="row-chev" />
    </div>
  );
}

function Detail({ t, onClose, onStatus, onReminder, onEdit, onDelete }) {
  const [saving, setSaving] = useState(false);
  const has = !!t.eventId;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="detail-top">
          <span className="tag" style={{ background: catColor(t.cat) + "1A", color: catColor(t.cat) }}>{t.cat}</span>
          <div className="detail-actions">
            <button className="icon-btn" onClick={onEdit} aria-label="עריכה"><Pencil size={17} /></button>
            <button className="icon-btn danger" onClick={onDelete} aria-label="מחיקה"><Trash2 size={17} /></button>
          </div>
        </div>
        <h3>{t.title}</h3>
        <button className="status-pill" onClick={() => onStatus(t)}>
          <StatusIcon status={t.status} size={16} /> {t.status} · להחלפה
        </button>
        <dl className="kv">
          {t.due && <div><dt>תאריך יעד</dt><dd>{new Date(t.due).toLocaleDateString("he-IL")}</dd></div>}
          {t.prio && <div><dt>עדיפות</dt><dd>{t.prio}</dd></div>}
          {t.reminderDays && <div><dt>תזכורת</dt><dd>{t.reminderDays} ימים לפני</dd></div>}
          {t.who && <div><dt>גורם מטפל</dt><dd>{t.who}</dd></div>}
          {t.phone && <div><dt>טלפון</dt><dd><a href={`tel:${t.phone}`}>{t.phone}</a></dd></div>}
          {t.docs && <div><dt>מסמכים</dt><dd>{t.docs}</dd></div>}
          {t.link && <div><dt>קישור</dt><dd><a href={t.link} target="_blank" rel="noreferrer">פתיחה</a></dd></div>}
          {t.note && <div><dt>הערות</dt><dd>{t.note}</dd></div>}
        </dl>
        <button className={"cal-btn" + (has ? " ok" : "")} disabled={saving || !t.due}
          onClick={async () => { setSaving(true); await onReminder(t); setSaving(false); }}>
          <CalendarPlus size={18} /> {saving ? "שומר…" : has ? "עדכון התזכורת ביומן" : "הוספת תזכורת ליומן גוגל"}
        </button>
        {!t.due && <p className="hint">כדי ליצור תזכורת, הגדר תחילה תאריך יעד למשימה בגיליון.</p>}
      </div>
    </div>
  );
}

function TaskForm({ title, submitLabel, initial, onClose, onSave }) {
  const blank = { title: "", cat: Object.keys(CATEGORIES)[0], status: STATUSES[0], prio: "בינונית", due: "", reminderDays: "3", who: "", phone: "", docs: "", link: "", note: "" };
  // בעריכה: ממלאים מראש מהמשימה הקיימת; שדות ריקים נשארים ריקים וניתנים למילוי
  const [f, setF] = useState(initial ? { ...blank, ...pick(initial) } : blank);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length > 0;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {title} <button className="bell" onClick={onClose} style={{ width: 34, height: 34 }}><X size={18} /></button>
        </h3>
        <div className="field"><label>שם המשימה</label><input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="למשל: הגשת טופס 161" /></div>
        <div className="two">
          <div className="field"><label>קטגוריה</label>
            <select value={f.cat} onChange={(e) => set("cat", e.target.value)}>{Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label>סטטוס</label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="two">
          <div className="field"><label>עדיפות</label>
            <select value={f.prio} onChange={(e) => set("prio", e.target.value)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="field"><label>תזכורת (ימים לפני)</label><input type="number" value={f.reminderDays} onChange={(e) => set("reminderDays", e.target.value)} /></div>
        </div>
        <div className="field"><label>תאריך יעד</label><input type="date" value={f.due} onChange={(e) => set("due", e.target.value)} /></div>
        <div className="two">
          <div className="field"><label>גורם מטפל</label><input value={f.who} onChange={(e) => set("who", e.target.value)} /></div>
          <div className="field"><label>טלפון</label><input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        </div>
        <div className="field"><label>מסמכים נדרשים</label><input value={f.docs} onChange={(e) => set("docs", e.target.value)} /></div>
        <div className="field"><label>קישור</label><input value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" /></div>
        <div className="field"><label>הערות</label><textarea value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
        <button className="cal-btn" disabled={!valid} onClick={() => onSave(f)}>{submitLabel}</button>
      </div>
    </div>
  );
}

// שולף רק את השדות שהטופס מנהל (לא _row/id/eventId/doneDate — אלה נשמרים בנפרד)
function pick(t) {
  const keys = ["title", "cat", "status", "prio", "due", "reminderDays", "who", "phone", "docs", "link", "note"];
  const o = {};
  keys.forEach((k) => { if (t[k] !== undefined && t[k] !== "") o[k] = t[k]; });
  return o;
}

function ConfirmDelete({ t, busy, onCancel, onConfirm }) {
  return (
    <div className="sheet-bg" onClick={onCancel} style={{ alignItems: "center" }}>
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon"><Trash2 size={24} /></div>
        <h3>למחוק את המשימה?</h3>
        <p>"{t.title}" תימחק מהגיליון{t.eventId ? ", והתזכורת תוסר מהיומן" : ""}. פעולה זו בלתי הפיכה.</p>
        <div className="confirm-btns">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>ביטול</button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>{busy ? "מוחק…" : "מחיקה"}</button>
        </div>
      </div>
    </div>
  );
}

function Tab({ id, cur, set, icon, label }) {
  return (
    <button className={"tab" + (cur === id ? " tab-on" : "")} onClick={() => set(id)}>
      {icon}<span>{label}</span>
    </button>
  );
}
