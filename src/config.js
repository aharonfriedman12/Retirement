/* =====================================================================
   הגדרות — מלא כאן שני ערכים אחרי שתסיים את ההקמה (ראה README.md)
   ===================================================================== */

// 1) מזהה הלקוח (Client ID) שקיבלת מ-Google Cloud (מסתיים ב-apps.googleusercontent.com)
export const CLIENT_ID = "984484632370-26iv79ujcet4il4j04dau2v473jeqke6.apps.googleusercontent.com";

// 2) מזהה הגיליון — מתוך כתובת ה-URL של הגיליון שלך:
//    https://docs.google.com/spreadsheets/d/<<< זה החלק שצריך >>>/edit
export const SHEET_ID = "1xu0f7lrkylksz7PAv8Vl863vEABqThag1791_pPggII";

/* ---------- בדרך כלל אין צורך לגעת מכאן ולמטה ---------- */

// ההרשאות שהאפליקציה מבקשת: עריכת הגיליון + יצירת אירועים ביומן בלבד
export const SCOPES =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.events";

// הקטגוריות והצבעים שלהן (אפשר לערוך/להוסיף; הצבע הוא קוד hex)
export const CATEGORIES = {
  "פיננסי ופנסיוני": "#2F7E7A",
  רפואי: "#3E6E8E",
  "אדמיניסטרטיבי וציוד": "#6B7551",
  "זכויות והטבות": "#7A5C7E",
  "קריירה אזרחית": "#C98A2B",
  "אישי/משפחתי": "#B5635C",
};

export const STATUSES = ["לא התחיל", "בתהליך", "ממתין לגורם חיצוני", "הושלם"];
export const PRIORITIES = ["גבוהה", "בינונית", "נמוכה"];
