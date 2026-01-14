/* =========================
   Budget Buddy – Core Logic
   ========================= */

const STORE_KEY = "budget_buddy_v3";

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isoDay = (d) => startOfDay(d).toISOString().slice(0, 10);
const daysBetween = (a, b) =>
  Math.max(0, Math.round((startOfDay(b) - startOfDay(a)) / 86400000));

/* ---------- default state ---------- */
function defaultState() {
  return {
    /* balances */
    holding: 0,
    savings: 0,
    tp: 0,
    snacks: 0,
    ent: 0,
    debt: 0,

    /* pay period */
    nextPayDate: "",

    /* snack daily lock */
    snackLockedDate: "",
    snackAllowanceToday: 0,
    snackSpentToday: 0,

    /* workday rules */
    excludeTue: true,
    excludeWed: true,
    pto: [], // { date: "YYYY-MM-DD", label }

    /* bills */
    bills: [], // { name, amount, dueType, dayOfMonth, dayOfWeek, dueDate }

    /* split rules */
    savingsPct: 35,
    debtChunk: 25,
    tpFixed: 50,
    snacksFixed: 75,
    entFixed: 75,

    /* caps */
    caps: {
      tp: { enabled: true, max: 100 },
      snacks: { enabled: true, max: 75 },
      ent: { enabled: true, max: 75 },
      holding: { enabled: false, max: 0 },
    },

    /* history */
    history: [],

    lastSaved: "",
  };
}

/* ---------- load / save ---------- */
function migrate(s) {
  const d = defaultState();
  return {
    ...d,
    ...s,
    caps: {
      tp: { ...d.caps.tp, ...(s.caps?.tp || {}) },
      snacks: { ...d.caps.snacks, ...(s.caps?.snacks || {}) },
      ent: { ...d.caps.ent, ...(s.caps?.ent || {}) },
      holding: { ...d.caps.holding, ...(s.caps?.holding || {}) },
    },
    pto: Array.isArray(s.pto) ? s.pto : [],
    bills: Array.isArray(s.bills) ? s.bills : [],
    history: Array.isArray(s.history) ? s.history : [],
  };
}

let state = (() => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
})();

function save() {
  state.lastSaved = new Date().toISOString();
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  render();
}

/* ---------- history ---------- */
function addHistory(entry) {
  state.history.unshift({
    ts: new Date().toISOString(),
    ...entry,
  });
  if (state.history.length > 500) {
    state.history = state.history.slice(0, 500);
  }
}

/* ---------- workdays & PTO ---------- */
function cleanExpiredPTO() {
  const today = isoDay(new Date());
  state.pto = state.pto.filter((p) => p.date >= today);
}

function isExcludedWorkday(date) {
  const d = date.getDay(); // 0 Sun … 6 Sat
  if (state.excludeTue && d === 2) return true;
  if (state.excludeWed && d === 3) return true;
  return state.pto.some((p) => p.date === isoDay(date));
}

function countWorkdays(fromDate, toDate) {
  let count = 0;
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (isoDay(d) === isoDay(from)) continue; // skip today
    if (!isExcludedWorkday(d)) count++;
  }
  return count;
}

/* ---------- snack daily lock ---------- */
function ensureSnackDayLock() {
  cleanExpiredPTO();

  const today = new Date();
  const todayISO = isoDay(today);

  if (state.snackLockedDate === todayISO) return;

  state.snackLockedDate = todayISO;
  state.snackSpentToday = 0;

  const nextPay = state.nextPayDate
    ? new Date(state.nextPayDate + "T00:00:00")
    : null;

  if (!nextPay || isExcludedWorkday(today)) {
    state.snackAllowanceToday = 0;
    return;
  }

  const workdaysLeft = countWorkdays(today, nextPay);
  state.snackAllowanceToday =
    workdaysLeft > 0 ? round2(state.snacks / workdaysLeft) : 0;
}

/* ---------- caps ---------- */
function applyCap(bucket, current, addAmount) {
  const want = round2(addAmount);
  if (want <= 0) return { applied: 0, overflow: 0 };

  const cap = state.caps[bucket];
  if (!cap?.enabled) return { applied: want, overflow: 0 };

  const room = Math.max(0, round2(cap.max - current));
  const applied = round2(Math.min(room, want));
  return { applied, overflow: round2(want - applied) };
}

/* ---------- bills ---------- */
function nextBillDate(bill, today) {
  const t = startOfDay(today);

  if (bill.dueType === "once") {
    return bill.dueDate ? new Date(bill.dueDate + "T00:00:00") : null;
  }

  if (bill.dueType === "monthly") {
    const dom = bill.dayOfMonth || 1;
    let y = t.getFullYear();
    let m = t.getMonth();
    let d = new Date(y, m, dom);
    if (d < t) d = new Date(y, m + 1, dom);
    return d;
  }

  if (bill.dueType === "weekly") {
    const dow = bill.dayOfWeek;
    for (let i = 0; i < 14; i++) {
      const d = new Date(t);
      d.setDate(d.getDate() + i);
      if (d.getDay() === dow) return d;
    }
  }

  return null;
}

function billsDueBeforeNextCheck() {
  if (!state.nextPayDate) return { list: [], total: 0 };

  const today = new Date();
  const nextPay = new Date(state.nextPayDate + "T00:00:00");

  const list = [];
  let total = 0;

  state.bills.forEach((b) => {
    const d = nextBillDate(b, today);
    if (d && d < nextPay) {
      total += Number(b.amount || 0);
      list.push({
        name: b.name,
        amount: Number(b.amount || 0),
        dueDate: isoDay(d),
      });
    }
  });

  return { list, total: round2(total) };
}

/* ---------- purchases ---------- */
function checkPurchase(amount, category) {
  ensureSnackDayLock();

  const amt = round2(amount);
  if (amt <= 0) return { ok: false };

  const nextPay = state.nextPayDate
    ? new Date(state.nextPayDate + "T00:00:00")
    : null;
  const daysLeft = nextPay ? daysBetween(new Date(), nextPay) : "—";

  let remaining = 0;
  let ok = true;

  if (category === "snacks") {
    const leftToday = round2(
      state.snackAllowanceToday - state.snackSpentToday
    );
    remaining = state.snacks;
    if (isExcludedWorkday(new Date())) ok = false;
    if (amt > leftToday || amt > remaining) ok = false;
  }

  if (category === "ent") {
    remaining = state.ent;
    if (amt > remaining) ok = false;
  }

  if (category === "tp") {
    remaining = state.tp;
    if (amt > remaining) ok = false;
  }

  return {
    ok,
    output:
      `Answer: ${ok ? "yes" : "no"}\n` +
      `Remaining budget: ${fmt(ok ? remaining - amt : remaining)}\n` +
      `How many days left till the next check: ${daysLeft}\n` +
      `Will the budget last through till the next check: ${ok ? "yes" : "no"}`,
  };
}

function applyPurchase(amount, category) {
  ensureSnackDayLock();
  const amt = round2(amount);

  if (category === "snacks") {
    state.snacks = round2(state.snacks - amt);
    state.snackSpentToday = round2(state.snackSpentToday + amt);
  }
  if (category === "ent") state.ent = round2(state.ent - amt);
  if (category === "tp") state.tp = round2(state.tp - amt);

  addHistory({ type: "purchase", category, amount: amt });
  save();
}

/* ---------- new check processing ---------- */
function processNewCheck(deposit, nextPayDate, newDebt) {
  let remaining = round2(deposit);
  state.nextPayDate = nextPayDate;
  state.debt = round2(newDebt);

  /* bills */
  const { total } = billsDueBeforeNextCheck();
  const toHolding = Math.min(total, remaining);
  state.holding = round2(state.holding + toHolding);
  remaining = round2(remaining - toHolding);

  /* savings % */
  const toSavings = round2(remaining * (state.savingsPct / 100));
  state.savings += toSavings;
  remaining = round2(remaining - toSavings);

  /* TP */
  let r = applyCap("tp", state.tp, Math.min(state.tpFixed, remaining));
  state.tp += r.applied;
  state.savings += r.overflow;
  remaining = round2(remaining - r.applied);

  /* Snacks */
  r = applyCap("snacks", state.snacks, Math.min(state.snacksFixed, remaining));
  state.snacks += r.applied;
  state.savings += r.overflow;
  remaining = round2(remaining - r.applied);

  /* Entertainment */
  r = applyCap("ent", state.ent, Math.min(state.entFixed, remaining));
  state.ent += r.applied;
  state.savings += r.overflow;
  remaining = round2(remaining - r.applied);

  /* debt chunks */
  const chunk = Math.max(1, state.debtChunk);
  const debtPay = Math.min(
    state.debt,
    Math.floor(remaining / chunk) * chunk
  );
  state.debt = round2(state.debt - debtPay);
  remaining = round2(remaining - debtPay);

  /* leftover -> savings */
  if (remaining > 0) state.savings += remaining;

  addHistory({
    type: "newcheck",
    category: "check",
    amount: deposit,
    note: `Next check ${nextPayDate}`,
  });

  ensureSnackDayLock();
  save();
}

/* ---------- render (UI hook) ---------- */
function render() {
  ensureSnackDayLock();

  if ($("tSnackLeftToday"))
    $("tSnackLeftToday").textContent = fmt(
      Math.max(0, state.snackAllowanceToday - state.snackSpentToday)
    );

  if ($("tEnt")) $("tEnt").textContent = fmt(state.ent);
  if ($("tTP")) $("tTP").textContent = fmt(state.tp);
}

/* ---------- boot ---------- */
ensureSnackDayLock();
render();
