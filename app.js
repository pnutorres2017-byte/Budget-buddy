console.log("Budget Buddy loaded", new Date().toISOString());

window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  const STORE_KEY = "bb_state_v2";

  function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function fmt(n) {
    return Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  function isoDay(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return x.toISOString().slice(0, 10);
  }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysBetween(a, b) {
    return Math.max(0, Math.round((startOfDay(b) - startOfDay(a)) / 86400000));
  }

  const defaultState = () => ({
    // balances
    savings: 0,
    tp: 0,
    snacks: 0,
    ent: 0,

    // schedule
    nextPayDate: "",

    // workday rules
    excludeTue: true,
    excludeWed: true,
    pto: [], // ["YYYY-MM-DD", ...] non-recurring, expired removed automatically

    // daily snack lock
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
    renderTopCards();
  }

  /* ---------- Workdays / PTO ---------- */
  function cleanExpiredPTO() {
    const today = isoDay(new Date());
    state.pto = (state.pto || []).filter((d) => d >= today);
  }

  function isExcludedWorkday(dateObj) {
    const dow = dateObj.getDay(); // 0 Sun ... 6 Sat
    if (state.excludeTue && dow === 2) return true;
    if (state.excludeWed && dow === 3) return true;
    const id = isoDay(dateObj);
    return (state.pto || []).includes(id);
  }

  function countWorkdays(fromDate, toDate) {
    let count = 0;
    const from = startOfDay(fromDate);
    const to = startOfDay(toDate);

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (isoDay(d) === isoDay(from)) continue; // don't count "today" as remaining
      if (!isExcludedWorkday(d)) count++;
    }
    return count;
  }

  /* ---------- Snack day lock ---------- */
  function ensureSnackDayLock() {
    cleanExpiredPTO();

    const today = new Date();
    const todayISO = isoDay(today);

    if (state.snackLockedDate === todayISO) return;

    // new day
    state.snackLockedDate = todayISO;
    state.snackSpentToday = 0;

    if (!state.nextPayDate) {
      state.snackAllowanceToday = 0;
      return;
    }

    // If today is excluded, you get 0 snack allowance today
    if (isExcludedWorkday(today)) {
      state.snackAllowanceToday = 0;
      return;
    }

    const nextPay = new Date(state.nextPayDate + "T00:00:00");
    const workdaysLeft = countWorkdays(today, nextPay);

    state.snackAllowanceToday =
      workdaysLeft > 0 ? round2(state.snacks / workdaysLeft) : 0;
  }

  function snackRemainingToday() {
    ensureSnackDayLock();
    return Math.max(0, round2(state.snackAllowanceToday - state.snackSpentToday));
  }

  /* ---------- Top cards ---------- */
  const tSnackLeftToday = $("tSnackLeftToday");
  const tEnt = $("tEnt");
  const tTP = $("tTP");
  const tSnackTodaySub = $("tSnackTodaySub");

  function renderTopCards() {
    ensureSnackDayLock();

    if (tSnackLeftToday) tSnackLeftToday.textContent = fmt(snackRemainingToday());
    if (tEnt) tEnt.textContent = fmt(state.ent);
    if (tTP) tTP.textContent = fmt(state.tp);

    if (tSnackTodaySub) {
      tSnackTodaySub.textContent = `Allowance today: ${fmt(state.snackAllowanceToday)}`;
    }
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
    screens[name] && show(screens[name]);

    $$(".navBtn").forEach((b) => b.classList.remove("active"));
    document.querySelector(`.navBtn[data-nav="${name}"]`)?.classList.add("active");
  }

  $$(".navBtn").forEach((btn) => btn.addEventListener("click", () => switchScreen(btn.dataset.nav)));

  /* ---------- Sheets ---------- */
  const overlay = $("overlay");
  const sheetAdd = $("sheetAdd");
  const sheetPurchase = $("sheetPurchase");
  const sheetNewCheck = $("sheetNewCheck");

  function openSheet(sheet) { show(overlay); show(sheet); }
  function closeAllSheets() {
    hide(sheetAdd); hide(sheetPurchase); hide(sheetNewCheck); hide(overlay);
  }

  $("btnAdd")?.addEventListener("click", () => openSheet(sheetAdd));
  $("btnOpenPurchase")?.addEventListener("click", () => { hide(sheetAdd); openSheet(sheetPurchase); });
  $("btnOpenNewCheck")?.addEventListener("click", () => { hide(sheetAdd); openSheet(sheetNewCheck); });
  $("btnCloseSheet")?.addEventListener("click", closeAllSheets);
  $("btnClosePurchase")?.addEventListener("click", closeAllSheets);
  $("btnCloseNewCheck")?.addEventListener("click", closeAllSheets);
  overlay?.addEventListener("click", closeAllSheets);

  /* ---------- Settings: edit balances + next pay date ---------- */
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

    // reset snack day lock so allowance recalculates immediately
    state.snackLockedDate = "";
    ensureSnackDayLock();
    saveState();
    alert("Saved.");
  });

  /* ---------- Purchase ---------- */
  const pAmt = $("pAmt");
  const pCat = $("pCat");
  const pOut = $("pOut");
  const btnCheck = $("btnCheckPurchase");
  const btnApply = $("btnApplyPurchase");

  let lastDecision = { ok: false, cat: "", amt: 0, remaining: 0, daysLeft: 0, willLast: false };

  function normalizeCat(v) {
    return String(v || "").toLowerCase().trim(); // snacks, ent, tp
  }

  function daysLeftToNextPay() {
    if (!state.nextPayDate) return 14; // fallback
    const nextPay = new Date(state.nextPayDate + "T00:00:00");
    return daysBetween(new Date(), nextPay);
  }

  function decisionText(d) {
    return (
`Answer: ${d.ok ? "yes" : "no"}
Remaining budget: ${fmt(d.remaining)}
How many days left till the next check: ${d.daysLeft}
Will the budget last through till the next check: ${d.willLast ? "yes" : "no"}`
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
    lastDecision = { ok: false, cat: "", amt: 0, remaining: 0, daysLeft: daysLeftToNextPay(), willLast: false };
  });

  btnCheck?.addEventListener("click", () => {
    const amt = round2(Number(pAmt?.value || 0));
    const cat = normalizeCat(pCat?.value);

    const daysLeft = daysLeftToNextPay();

    if (!amt || amt <= 0) {
      lastDecision = { ok: false, cat, amt: 0, remaining: 0, daysLeft, willLast: false };
      pOut.textContent = decisionText(lastDecision);
      btnApply.disabled = true;
      return;
    }

    // Default to NO unless proven affordable
    let ok = false;
    let remaining = 0;

    if (cat === "snacks") {
      ensureSnackDayLock();

      // If snacks balance is empty => no
      if (state.snacks <= 0) {
        ok = false;
        remaining = state.snacks;
      } else if (isExcludedWorkday(new Date())) {
        ok = false;
        remaining = state.snacks;
      } else {
        const leftToday = snackRemainingToday();
        // rule: single purchase must be <= today's remaining allowance and <= snack balance
        ok = amt <= leftToday && amt <= state.snacks;
        remaining = ok ? round2(state.snacks - amt) : state.snacks;
      }
    } else if (cat === "ent") {
      ok = amt <= state.ent;
      remaining = ok ? round2(state.ent - amt) : state.ent;
    } else if (cat === "tp") {
      ok = amt <= state.tp;
      remaining = ok ? round2(state.tp - amt) : state.tp;
    } else {
      ok = false;
      remaining = 0;
    }

    lastDecision = { ok, cat, amt, remaining, daysLeft, willLast: ok };
    pOut.textContent = decisionText(lastDecision);
    btnApply.disabled = !ok;
  });

  btnApply?.addEventListener("click", () => {
    if (!lastDecision.ok) return;

    const { cat, amt } = lastDecision;

    if (cat === "snacks") {
      ensureSnackDayLock();
      state.snacks = round2(state.snacks - amt);
      state.snackSpentToday = round2(state.snackSpentToday + amt);
    } else if (cat === "ent") {
      state.ent = round2(state.ent - amt);
    } else if (cat === "tp") {
      state.tp = round2(state.tp - amt);
    }

    saveState();
    renderTopCards();

    // reset purchase UI
    if (pAmt) pAmt.value = "";
    if (pOut) pOut.textContent = "";
    btnApply.disabled = true;
    lastDecision = { ok: false, cat: "", amt: 0, remaining: 0, daysLeft: daysLeftToNextPay(), willLast: false };

    alert("Applied.");
  });

  /* ---------- New check preview (still preview-only) ---------- */
  const cDeposit = $("cDeposit");
  const cNextPay = $("cNextPay");
  const cDebt = $("cDebt");
  const cOut = $("cOut");
  const btnPreviewCheck = $("btnPreviewCheck");
  const btnApplyCheck = $("btnApplyCheck");

  btnPreviewCheck?.addEventListener("click", () => {
    const deposit = Number(cDeposit?.value || 0);
    const debt = Number(cDebt?.value || 0);
    const nextPay = (cNextPay?.value || "").trim();

    if (!deposit || deposit <= 0 || !nextPay) {
      cOut.textContent = "Please enter a valid deposit and next paycheck date.";
      btnApplyCheck.disabled = true;
      return;
    }

    cOut.textContent =
`NEW CHECK PREVIEW

Deposit: ${fmt(deposit)}
Next paycheck: ${nextPay}
Debt (reported): ${fmt(debt)}

(No balances have been changed)`;

    btnApplyCheck.disabled = true; // still disabled until we wire apply
  });

  btnApplyCheck?.addEventListener("click", () => {
    alert("Apply not enabled yet.");
  });

  /* ---------- Init ---------- */
  switchScreen("today");
  ensureSnackDayLock();
  saveState();
  renderTopCards();
});
