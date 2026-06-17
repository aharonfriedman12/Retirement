/* =====================================================================
   שכבת החיבור לגוגל — התחברות (OAuth), קריאה/כתיבה לשיטס, ויצירת אירועים ביומן.
   הכל רץ מהדפדפן ישירות מול גוגל. אין שרת אמצעי, הנתונים נשארים אצלך.
   ===================================================================== */

import { CLIENT_ID, SHEET_ID, SCOPES } from "./config";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// סדר העמודות בלשונית Tasks (חייב להתאים לכותרות בגיליון)
// A id | B title | C cat | D status | E prio | F due | G reminderDays
// H who | I phone | J docs | K link | L note | M doneDate | N eventId
const COLS = ["id","title","cat","status","prio","due","reminderDays","who","phone","docs","link","note","doneDate","eventId"];

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let tasksSheetId = null; // מזהה פנימי (מספרי) של לשונית Tasks — נדרש למחיקת שורה

/* ---------- טעינת ספריית גוגל והכנת לקוח הטוקן ---------- */
export function initGoogle() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return setup(resolve);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => setup(resolve);
    s.onerror = () => reject(new Error("טעינת ספריית גוגל נכשלה"));
    document.body.appendChild(s);
  });

  function setup(resolve) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // מוגדר מחדש בכל בקשה
    });
    resolve();
  }
}

/* ---------- התחברות / קבלת טוקן ---------- */
export function signIn(forceConsent = false) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("גוגל עדיין לא מוכן"));
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(resp);
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: forceConsent ? "consent" : "" });
  });
}

export function isSignedIn() {
  return !!accessToken && Date.now() < tokenExpiry;
}

async function getToken() {
  if (isSignedIn()) return accessToken;
  return signIn();
}

/* ---------- קריאה כללית מ-API של גוגל ---------- */
async function api(url, opts = {}) {
  let t = await getToken();
  let res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    accessToken = null;
    t = await getToken();
    res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`שגיאת גוגל ${res.status}: ${txt}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

/* ---------- המרות שורה <-> אובייקט ---------- */
function rowToTask(row, rowNum) {
  const t = { _row: rowNum };
  COLS.forEach((c, i) => (t[c] = row[i] ?? ""));
  return t;
}
function taskToRow(t) {
  return COLS.map((c) => (t[c] ?? "").toString());
}

/* ---------- משימות ---------- */
export async function readTasks() {
  const data = await api(`${SHEETS}/${SHEET_ID}/values/Tasks!A2:N2000`);
  return (data.values || []).map((r, i) => rowToTask(r, i + 2)).filter((t) => t.title);
}

export async function updateTask(t) {
  await api(`${SHEETS}/${SHEET_ID}/values/Tasks!A${t._row}:N${t._row}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [taskToRow(t)] }),
  });
}

export async function addTask(t) {
  const row = taskToRow({ ...t, id: Date.now() });
  await api(`${SHEETS}/${SHEET_ID}/values/Tasks!A:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

/* ---------- מחיקת משימה (מסירה את השורה מהגיליון + תזכורת מהיומן) ---------- */
async function getTasksSheetId() {
  if (tasksSheetId !== null) return tasksSheetId;
  const data = await api(`${SHEETS}/${SHEET_ID}?fields=sheets.properties`);
  const sheet = (data.sheets || []).find((s) => s.properties?.title === "Tasks");
  if (!sheet) throw new Error('לא נמצאה לשונית בשם "Tasks"');
  tasksSheetId = sheet.properties.sheetId;
  return tasksSheetId;
}

export async function deleteTask(t) {
  // קודם מוחקים את התזכורת מהיומן (אם קיימת), כדי לא להשאיר אירוע יתום
  if (t.eventId) await deleteCalendarEvent(t.eventId);
  const sheetId = await getTasksSheetId();
  await api(`${SHEETS}/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: t._row - 1, endIndex: t._row },
        },
      }],
    }),
  });
}

/* ---------- הגדרות (תאריך פרישה וכו') מלשונית Config ---------- */
export async function readConfig() {
  const data = await api(`${SHEETS}/${SHEET_ID}/values/Config!A2:B50`);
  const map = {};
  (data.values || []).forEach(([k, v]) => { if (k) map[k] = v; });
  return map;
}

/* ---------- יומן: יצירה/עדכון תזכורת (סנכרון חד-כיווני אפליקציה→יומן) ---------- */
export async function upsertReminder(t) {
  const due = new Date(t.due);
  const remind = new Date(due);
  remind.setDate(due.getDate() - (Number(t.reminderDays) || 3));
  const dateStr = remind.toISOString().slice(0, 10);
  const body = {
    summary: `תזכורת פרישה: ${t.title}`,
    description: `קטגוריה: ${t.cat}` + (t.who ? `\nגורם מטפל: ${t.who}` : "") + (t.note ? `\n${t.note}` : ""),
    start: { date: dateStr },
    end: { date: dateStr },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 9 * 60 }] },
  };
  if (t.eventId) {
    await api(`${CAL}/${t.eventId}`, { method: "PATCH", body: JSON.stringify(body) });
    return t.eventId;
  }
  const ev = await api(CAL, { method: "POST", body: JSON.stringify(body) });
  return ev.id;
}

/* ---------- יומן: מחיקת אירוע (מתעלם בעדינות אם כבר נמחק) ---------- */
export async function deleteCalendarEvent(eventId) {
  const t = await getToken();
  const res = await fetch(`${CAL}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t}` },
  });
  // 204 = נמחק, 404/410 = כבר לא קיים — שני המקרים תקינים
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`מחיקת אירוע מהיומן נכשלה (${res.status})`);
  }
}
