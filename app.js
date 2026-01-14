console.log("Budget Buddy loaded", new Date().toISOString());

window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  const STORE_KEY = "bb_state_v5";

  function show(el) { el?.classList.remove("hidden"); }
  function hide(el) { el?.classList.add("hidden"); }

  function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function fmt(n) {
    return Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function isoDay(d) { return startOfDay(d).toISOString().slice(0, 10); }
  function daysBetween(a, b) {
    return Math.max(0, Math.round((startOfDay(b) - startOfDay(a)) / 86400000));
  }

  const defaultState = () => ({
    savings: 0,
    tp: 0,
    snacks: 0,
    ent: 0,

    nextPayDate: "",

    // Your rule: only Tue/Wed are excluded by default (weekends are workdays)
    excludeTue: true,
    excludeWed: true,
    pto: [],

    snackLockedDate: "",
    snackAllowanceToday: 0,
    snackSpentToday: 0,
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      return { ...defaultState(), ...JSON.parse(raw) };
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  /* ---------- PTO / workday logic ---------- */
  function cleanExpiredPTO() {
    const today = isoDay(new Date());
    state.pto = (state.pto || []).filter((d) => d >= today);
  }

  function isExcludedWorkday(d) {
    const dow = d.getDay(); // 0 Sun ... 6 Sat
    if (state.excludeTue && dow === 2) return true;
    if (state.excludeWed && dow === 3) return true;

    const id = isoDay(d);
    return (state.pto || []).includes(id);
  }

  function safeParseDate(yyyy_mm_dd) {
    const dt = new Date(`${yyyy_mm_dd}T00:00:00`);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function countWorkdays(fromDate, toDate) {
    let count = 0;
    const from = startOfDay(fromDate);
    const to = startOfDay(toDate);

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (isoDay(d) === isoDay(from)) continue; // don't count today
      if (!isExcludedWorkday(d)) count++;
    }
    return count;
  }

  /* ---------- TP protection helper ---------- */
  function nextPayDateObjOrFallback() {
    const nextPay = state.nextPayDate ? safeParseDate(state.nextPayDate) : null;
    if (nextPay) return nextPay;

    // fallback: 14 days out if next pay isn't set/parseable
    const d = new Date();
    const fb = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    fb.setDate(fb.getDate() + 14);
    return fb;
  }

  // “another Wednesday before my check”
  // = there exists at least one Wednesday strictly AFTER today and ON/BEFORE nextPayDate
  function hasUpcomingWednesdayBeforeNextPay() {
    const today = startOfDay(new Date());
    const nextPay = startOfDay(nextPayDateObjOrFallback());

    for (let d = new Date(today); d <= nextPay; d.setDate(d.getDate() + 1)) {
      if (isoDay(d) === isoDay(today)) continue; // skip today
      if (d.getDay() === 3) return true; // Wednesday
    }
    return false;
  }

  /* ---------- Snack daily lock ---------- */
  function ensureSnackDayLock(forceRecalc = false) {
    cleanExpiredPTO();

    const today = new Date();
    const todayISO = isoDay(today);

    if (!forceRecalc && state.snackLockedDate === todayISO) return;

    state.snackLockedDate = todayISO;
    if (!forceRecalc) state.snackSpentToday = 0;

    if (isExcludedWorkday(today)) {
      state.snackAllowanceToday = 0;
      saveState();
      return;
    }

    const nextPay = state.nextPayDate ? safeParseDate(state.nextPayDate) : null;

    if (!nextPay) {
      const fallbackWorkdays = 10;
      state.snackAllowanceToday = fallbackWorkdays > 0 ? round2(state.snacks / fallbackWorkdays) : 0;
      saveState();
      return;
    }

    const workdaysLeft = countWorkdays(today, nextPay);
    state.snackAllowanceToday = workdaysLeft > 0 ? round2(state.snacks / workdaysLeft) : 0;

    saveState();
  }

  function snackRemainingToday() {
    ensureSnackDayLock(false);
    return Math.max(0, round2(state.snackAllowanceToday - state.snackSpentToday));
  }

  function daysLeftToNextPay() {
    const nextPay = state.nextPayDate ? safeParseDate(state.nextPayDate) : null;
    if (!nextPay) return 14;
    return daysBetween(new Date(), nextPay);
  }

  /* ---------- UI render (robust) ---------- */
  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function renderTopCards() {
    ensureSnackDayLock(true);

    setText("tSnackLeftToday", fmt(snackRemainingToday()));
    setText("tSnackTodaySub", `Allowance today: ${fmt(state.snackAllowanceToday)}`);

    setText("tEnt", fmt(state.ent));
    setText("tTP", fmt(state.tp));

    // optional fallback ids
    setText("snackToday", fmt(snackRemainingToday()));
    setText("snackAllowance", fmt(state.snackAllowanceToday));
  }

  /* ---------- Screens / Nav ---------- */
  const screens = {
    today: $("screenToday"),
    history: $("screenHistory"),
    calendar: $("screenCalendar"),
    manage: $("screenManage"),
  };

  function switchScreen(name) {
    Object.values(screens).forEach(hide);
    show(screens[name]);

    $$(".navBtn").forEach((b) => b.classList.remove("active"));
    document.querySelector(`.navBtn[data-nav="${name}"]`)?.classList.add("active");

    renderTopCards();
  }

  $$(".navBtn").forEach((btn) => btn.addEventListener("click", () => switchScreen(btn.dataset.nav)));

  /* ---------- Sheets ---------- */
  const overlay = $("overlay");
  const sheetAdd = $("sheetAdd");
  const sheetPurchase = $("sheetPurchase");
  const sheetNewCheck = $("sheetNewCheck");

  function openSheet(sheet) { show(overlay); show(sheet); }
  function closeAllSheets() { hide(sheetAdd); hide(sheetPurchase); hide(sheetNewCheck); hide(overlay); }

  $("btnAdd")?.addEventListener("click", () => openSheet(sheetAdd));
  $("btnOpenPurchase")?.addEventListener("click", () => { hide(sheetAdd); openSheet(sheetPurchase); });
  $("btnOpenNewCheck")?.addEventListener("click", () => { hide(sheetAdd); openSheet(sheetNewCheck); });
  $("btnCloseSheet")?.addEventListener("click", closeAllSheets);
  $("btnClosePurchase")?.addEventListener("click", closeAllSheets);
  $("btnCloseNewCheck")?.addEventListener("click", closeAllSheets);
  overlay?.addEventListener("click", closeAllSheets);

  /* ---------- Settings (balances + payday) ---------- */
  $("btnSettings")?.addEventListener("click", () => {
    const nextPay = prompt("Next paycheck date (YYYY-MM-DD):", state.nextPayDate || "");
    if (nextPay !== null) state.nextPayDate = nextPay.trim();

    const snacks = prompt("Snacks balance:", String(state.snacks));
    if (snacks !== null) state.snacks = round2(Number(snacks));

    const ent = prompt("Entertainment balance:", String(state.ent));
    if (ent !== null) state.ent = round2(Number(ent));

    const tp = prompt("TP balance:", String(state.tp));
    if (tp !== null) state.tp = round2(Number(tp));

    const savings = prompt("Savings balance:", String(state.savings));
    if (savings !== null) state.savings = round2(Number(savings));

    state.snackLockedDate = "";
    ensureSnackDayLock(true);
    saveState();
    renderTopCards();
    alert("Saved.");
  });

  /* ---------- Purchase ---------- */
  const pAmt = $("pAmt");
  const pCat = $("pCat");
  const pOut = $("pOut");
  const btnCheck = $("btnCheckPurchase");
  const btnApply = $("btnApplyPurchase");

  let lastDecision = { ok: false, cat: "", amt: 0 };

  function normalizeCat(v) {
    return String(v || "").toLowerCase().trim(); // snacks, ent, tp
  }

  function decisionText(ok, remaining, daysLeft, willLast, reasonLine = "") {
    return (
`Answer: ${ok ? "yes" : "no"}
Remaining budget: ${fmt(remaining)}
How many days left till the next check: ${daysLeft}
Will the budget last through till the next check: ${willLast ? "yes" : "no"}${reasonLine ? `\n${reasonLine}` : ""}`
    );
  }

  // Quick buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".quickBtn");
    if (!btn) return;
    if (!pAmt || !pCat) return;

    pAmt.value = btn.dataset.quickamt || "";
    pCat.value = btn.dataset.quickcat || "snacks";
    pOut.textContent = "";
    btnApply.disabled = true;
    lastDecision = { ok: false, cat: "", amt: 0 };
  });

  btnCheck?.addEventListener("click", () => {
    const amt = round2(Number(pAmt?.value || 0));
    const cat = normalizeCat(pCat?.value);
    const daysLeft = daysLeftToNextPay();

    if (!amt || amt <= 0) {
      pOut.textContent = decisionText(false, 0, daysLeft, false, "Reason: invalid amount");
      btnApply.disabled = true;
      lastDecision = { ok: false, cat, amt: 0 };
      return;
    }

    let ok = false;
    let remaining = 0;
    let reason = "";

    if (cat === "snacks") {
      ensureSnackDayLock(true);

      const todayExcluded = isExcludedWorkday(new Date());
      const leftToday = snackRemainingToday();

      if (todayExcluded) {
        ok = false;
        remaining = state.snacks;
        reason = `Reason: excluded day (Tue/Wed/PTO). Today allowance = ${fmt(state.snackAllowanceToday)}`;
      } else if (state.snacks <= 0) {
        ok = false;
        remaining = state.snacks;
        reason = "Reason: snack balance is $0";
      } else if (amt > leftToday) {
        ok = false;
        remaining = state.snacks;
        reason = `Reason: over daily limit. Left today = ${fmt(leftToday)} (Spent today = ${fmt(state.snackSpentToday)})`;
      } else if (amt > state.snacks) {
        ok = false;
        remaining = state.snacks;
        reason = `Reason: over snack balance (${fmt(state.snacks)})`;
      } else {
        ok = true;
        remaining = round2(state.snacks - amt);
      }
    } else if (cat === "ent") {
      ok = amt <= state.ent;
      remaining = ok ? round2(state.ent - amt) : state.ent;
      if (!ok) reason = `Reason: over entertainment balance (${fmt(state.ent)})`;
    } else if (cat === "tp") {
      const projected = round2(state.tp - amt);

      if (state.tp <= 0) {
        ok = false;
        remaining = state.tp;
        reason = "Reason: TP balance is $0";
      } else if (amt > state.tp) {
        ok = false;
        remaining = state.tp;
        reason = `Reason: over TP balance (${fmt(state.tp)})`;
      } else {
        // TP protection rule:
        // If there is another Wednesday before next payday,
        // don't allow TP to drop below $15.
        const hasWed = hasUpcomingWednesdayBeforeNextPay();
        if (hasWed && projected < 15) {
          ok = false;
          remaining = state.tp;
          reason = `Reason: TP protection — upcoming Wednesday before next check requires TP >= ${fmt(15)}. After purchase would be ${fmt(projected)}`;
        } else {
          ok = true;
          remaining = projected;
        }
      }
    } else {
      ok = false;
      remaining = 0;
      reason = "Reason: unknown category";
    }

    pOut.textContent = decisionText(ok, remaining, daysLeft, ok, reason);
    btnApply.disabled = !ok;
    lastDecision = { ok, cat, amt };
  });

  btnApply?.addEventListener("click", () => {
    if (!lastDecision.ok) return;

    const { cat, amt } = lastDecision;

    if (cat === "snacks") {
      ensureSnackDayLock(true);
      state.snacks = round2(state.snacks - amt);
      state.snackSpentToday = round2(state.snackSpentToday + amt);
    } else if (cat === "ent") {
      state.ent = round2(state.ent - amt);
    } else if (cat === "tp") {
      state.tp = round2(state.tp - amt);
    }

    saveState();
    renderTopCards();

    pAmt.value = "";
    pOut.textContent = "";
    btnApply.disabled = true;
    lastDecision = { ok: false, cat: "", amt: 0 };

    alert("Applied.");
  });

  /* ---------- Keep Today UI fresh ---------- */
  renderTopCards();
  switchScreen("today");
  setInterval(renderTopCards, 10000);
});
