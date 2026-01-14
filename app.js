/* =========================
   Budget Buddy — app.js (FULL REPLACEMENT)
   Paste this as your entire app.js file
   ========================= */

console.log("Budget Buddy loaded", new Date().toISOString());

window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* ---------- Storage ---------- */
  const STORE_KEY = "bb_state_v8";
  const DEFAULT_STATE = () => ({
    // balances
    savings: 0,
    tp: 0,
    snacks: 0,
    ent: 0,

    // pay + scheduling
    nextPayDate: "",

    // advanced (workday rules)
    excludeTue: true,
    excludeWed: true,
    pto: [], // ["YYYY-MM-DD", ...]

    // snack daily tracking
    snackLockedDate: "",
    snackAllowanceToday: 0,
    snackSpentToday: 0,

    // caps
    capsEnabled: true,
    overflowToSavings: true, // if caps enabled, overflow should go to savings

    // cap toggles (requested)
    capTPEnabled: true,        // TP has its own toggle
    capFoodEnabled: true,      // Snacks + “food” share a toggle (treated as snacks)
    // cap values
    capTP: 100,
    capFood: 75,
    capEnt: 75,

    // history
    history: [] // {ts, type, details}
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return DEFAULT_STATE();
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE(), ...(parsed || {}) };
    } catch (e) {
      console.warn("Failed to load state:", e);
      return DEFAULT_STATE();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  /* ---------- Helpers ---------- */
  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }
  function fmt(n) {
    return Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  function show(el) { el?.classList.remove("hidden"); }
  function hide(el) { el?.classList.add("hidden"); }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function isoDay(d) { return startOfDay(d).toISOString().slice(0, 10); }
  function safeParseDate(yyyy_mm_dd) {
    if (!yyyy_mm_dd) return null;
    const dt = new Date(`${yyyy_mm_dd}T00:00:00`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function daysBetween(a, b) {
    return Math.max(0, Math.round((startOfDay(b) - startOfDay(a)) / 86400000));
  }

  function pushHistory(type, details) {
    state.history = Array.isArray(state.history) ? state.history : [];
    state.history.unshift({ ts: new Date().toISOString(), type, details: String(details || "") });
    if (state.history.length > 150) state.history = state.history.slice(0, 150);
  }

  /* ---------- PTO / workday rules ---------- */
  function cleanExpiredPTO() {
    const today = isoDay(new Date());
    state.pto = (state.pto || []).filter((d) => d >= today);
  }

  // Workdays = all days except Tue/Wed + PTO
  function isExcludedWorkday(d) {
    const dow = d.getDay(); // 0 Sun ... 6 Sat
    if (state.excludeTue && dow === 2) return true;
    if (state.excludeWed && dow === 3) return true;
    const id = isoDay(d);
    return (state.pto || []).includes(id);
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

  function nextPayDateObjOrFallback() {
    const nextPay = state.nextPayDate ? safeParseDate(state.nextPayDate) : null;
    if (nextPay) return nextPay;
    const d = new Date();
    const fb = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    fb.setDate(fb.getDate() + 14);
    return fb;
  }

  function hasUpcomingWednesdayBeforeNextPay() {
    const today = startOfDay(new Date());
    const nextPay = startOfDay(nextPayDateObjOrFallback());
    for (let d = new Date(today); d <= nextPay; d.setDate(d.getDate() + 1)) {
      if (isoDay(d) === isoDay(today)) continue;
      if (d.getDay() === 3) return true;
    }
    return false;
  }

  /* ---------- Snack daily lock / allowance ---------- */
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

  /* ---------- Caps enforcement (silent) ---------- */
  function enforceCapsSilent() {
    if (!state.capsEnabled) return;

    // per your rule: overflow always goes to savings if caps enabled
    state.overflowToSavings = true;

    // Snacks/Food cap (shared)
    if (state.capFoodEnabled) {
      const cap = Number(state.capFood) || 0;
      if (cap > 0 && state.snacks > cap) {
        const overflow = round2(state.snacks - cap);
        state.snacks = cap;
        state.savings = round2(state.savings + overflow);
        pushHistory("cap", `Snacks/Food capped; moved ${fmt(overflow)} to Savings.`);
      }
    }

    // Entertainment cap (always applies when caps enabled)
    {
      const cap = Number(state.capEnt) || 0;
      if (cap > 0 && state.ent > cap) {
        const overflow = round2(state.ent - cap);
        state.ent = cap;
        state.savings = round2(state.savings + overflow);
        pushHistory("cap", `Entertainment capped; moved ${fmt(overflow)} to Savings.`);
      }
    }

    // TP cap (toggle)
    if (state.capTPEnabled) {
      const cap = Number(state.capTP) || 0;
      if (cap > 0 && state.tp > cap) {
        const overflow = round2(state.tp - cap);
        state.tp = cap;
        state.savings = round2(state.savings + overflow);
        pushHistory("cap", `TP capped; moved ${fmt(overflow)} to Savings.`);
      }
    }
  }

  /* ---------- Render (Top cards) ---------- */
  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function renderTopCards() {
    ensureSnackDayLock(true);
    setText("todaySnacksLeft", fmt(snackRemainingToday()));
    setText("balEnt", fmt(state.ent));
    setText("balTP", fmt(state.tp));
    setText("balSnacks", fmt(state.snacks));
    setText("balSavings", fmt(state.savings));
    setText("tSnackTodaySub", `Allowance today: ${fmt(state.snackAllowanceToday)}`);
    setText("snackAllowance", fmt(state.snackAllowanceToday));
  }

  /* ---------- Screens / Bottom Nav ---------- */
  function setActiveNav(screenId) {
    $$(".bottomNav .navBtn, .bottomNav .navAdd").forEach((b) => b.classList.remove("active"));
    const btn = document.querySelector(`.bottomNav [data-screen="${screenId}"]`);
    if (btn) btn.classList.add("active");
  }

  function renderHistory() {
    const el = $("historyList");
    if (!el) return;

    const items = Array.isArray(state.history) ? state.history : [];
    if (!items.length) {
      el.textContent = "No history yet.";
      return;
    }

    el.textContent = items.slice(0, 40).map((h) => {
      const t = new Date(h.ts).toLocaleString();
      return `${t} — ${h.type}: ${h.details}`;
    }).join("\n");
  }

  function renderCalendar() {
    const list = $("ptoList");
    if (!list) return;
    cleanExpiredPTO();
    const pto = (state.pto || []).slice().sort();
    list.textContent = pto.length ? pto.join("\n") : "No PTO dates set.";
  }

  function renderManage() {
    // placeholder until bills editor wiring is added
  }

  function switchScreen(screenId) {
    $$(".screen").forEach((sec) => {
      sec.classList.toggle("hidden", sec.id !== screenId);
    });
    setActiveNav(screenId);
    renderTopCards();

    if (screenId === "screenHistory") renderHistory();
    if (screenId === "screenCalendar") renderCalendar();
    if (screenId === "screenManage") renderManage();
  }

  $$(".bottomNav [data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-screen");
      if (target) switchScreen(target);
    });
  });

  /* ---------- Sheets (Add / Purchase / New Check) ---------- */
  const sheetOverlay = $("sheetOverlay");
  const sheetAdd = $("sheetAdd");
  const sheetPurchase = $("sheetPurchase");
  const sheetNewCheck = $("sheetNewCheck");

  function openSheet(sheetEl) {
    show(sheetOverlay);
    hide(sheetAdd);
    hide(sheetPurchase);
    hide(sheetNewCheck);
    show(sheetEl);
  }

  function closeAllSheets() {
    hide(sheetAdd);
    hide(sheetPurchase);
    hide(sheetNewCheck);
    hide(sheetOverlay);
  }

  $("btnAdd")?.addEventListener("click", () => openSheet(sheetAdd));
  $("btnOpenNewCheck")?.addEventListener("click", () => openSheet(sheetNewCheck));
  $("btnOpenPurchase")?.addEventListener("click", () => openSheet(sheetPurchase));

  $("btnCloseSheetAdd")?.addEventListener("click", closeAllSheets);
  $("btnCloseSheetPurchase")?.addEventListener("click", closeAllSheets);
  $("btnCloseSheetNewCheck")?.addEventListener("click", closeAllSheets);
  sheetOverlay?.addEventListener("click", closeAllSheets);

  /* ---------- Purchase (DOM hookup) ---------- */
const pAmt = $("purchaseAmount");
const pCat = $("purchaseCategory");
const pOut = $("purchaseDecision");
const btnCheck = $("btnCheckPurchase");
const btnApply = $("btnApplyPurchase");

/* ---------- New Check Preview (DOM hookup) ---------- */
const cDeposit = $("checkDeposit");
const cNextPay = $("checkPayday");     // date input in HTML
const cDebt = $("checkDebt");
const cOut = $("checkPreviewOut");
const btnPreviewCheck = $("btnPreviewCheck");
const btnApplyCheck = $("btnApplyCheck");

  let lastDecision = { ok: false, cat: "", amt: 0 };

  function normalizeCat(v) {
    const x = String(v || "").toLowerCase().trim();
    if (x === "food") return "snacks"; // food shares cap + balance
    return x; // snacks, ent, tp
  }

  function decisionText(ok, remaining, daysLeft, willLast, reasonLine = "") {
    return (
`Answer: ${ok ? "yes" : "no"}
Remaining budget: ${fmt(remaining)}
How many days left till the next check: ${daysLeft}
Will the budget last through till the next check: ${willLast ? "yes" : "no"}${reasonLine ? `\n${reasonLine}` : ""}`
    );
  }

  // Quick purchase: elements with .qpBtn and data-amt/data-cat
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".qpBtn");
    if (!btn) return;
    if (!pAmt || !pCat) return;

    pAmt.value = btn.dataset.amt || "";
    pCat.value = btn.dataset.cat || "snacks";
    if (pOut) pOut.textContent = "";
    if (btnApplyPurchase) btnApplyPurchase.disabled = true;
    lastDecision = { ok: false, cat: "", amt: 0 };
  });

  btnCheckPurchase?.addEventListener("click", () => {
    const amt = round2(Number(pAmt?.value || 0));
    const cat = normalizeCat(pCat?.value);
    const daysLeft = daysLeftToNextPay();

    if (!amt || amt <= 0) {
      if (pOut) pOut.textContent = decisionText(false, 0, daysLeft, false, "Reason: invalid amount");
      if (btnApplyPurchase) btnApplyPurchase.disabled = true;
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
      if (state.ent <= 0) {
        ok = false;
        remaining = state.ent;
        reason = "Reason: entertainment balance is $0";
      } else if (amt > state.ent) {
        ok = false;
        remaining = state.ent;
        reason = `Reason: over entertainment balance (${fmt(state.ent)})`;
      } else {
        ok = true;
        remaining = round2(state.ent - amt);
      }
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

    if (pOut) pOut.textContent = decisionText(ok, remaining, daysLeft, ok, reason);
    if (btnApplyPurchase) btnApplyPurchase.disabled = !ok;
    lastDecision = { ok, cat, amt };
  });

  btnApplyPurchase?.addEventListener("click", () => {
    if (!lastDecision.ok) return;

    const { cat, amt } = lastDecision;

    if (cat === "snacks") {
      ensureSnackDayLock(true);
      state.snacks = round2(state.snacks - amt);
      state.snackSpentToday = round2(state.snackSpentToday + amt);
      pushHistory("purchase", `Snacks/Food: -${fmt(amt)}`);
    } else if (cat === "ent") {
      state.ent = round2(state.ent - amt);
      pushHistory("purchase", `Entertainment: -${fmt(amt)}`);
    } else if (cat === "tp") {
      state.tp = round2(state.tp - amt);
      pushHistory("purchase", `TP: -${fmt(amt)}`);
    }

    enforceCapsSilent();
    saveState();
    renderTopCards();

    if (pAmt) pAmt.value = "";
    if (pOut) pOut.textContent = "";
    if (btnApplyPurchase) btnApplyPurchase.disabled = true;
    lastDecision = { ok: false, cat: "", amt: 0 };

    alert("Applied.");
  });

  /* ---------- New Check Preview (preview only; apply disabled) ---------- */
  const cDeposit = $("cDeposit");
  const cNextPay = $("cNextPay");
  const cDebt = $("cDebt");
  const cOut = $("cOut");
  const btnPreviewCheck = $("btnPreviewCheck");
  const btnApplyCheck = $("btnApplyCheck");

  btnPreviewCheck?.addEventListener("click", () => {
    const deposit = round2(Number(cDeposit?.value || 0));
    const debt = round2(Number(cDebt?.value || 0));
    const nextPay = (cNextPay?.value || "").trim();

    if (!deposit || deposit <= 0 || !nextPay) {
      if (cOut) cOut.textContent = "Please enter a valid deposit and next paycheck date.";
      if (btnApplyCheck) btnApplyCheck.disabled = true;
      return;
    }

    if (cOut) {
      cOut.textContent =
`NEW CHECK PREVIEW

Deposit: ${fmt(deposit)}
Next paycheck: ${nextPay}
Debt (reported): ${fmt(debt)}

(No balances have been changed)
(Apply stays disabled for safety right now)`;
    }

    if (btnApplyCheck) btnApplyCheck.disabled = true;
  });

  btnApplyCheck?.addEventListener("click", () => {
    alert("Apply is disabled for now (preview only).");
  });

  /* ---------- Settings modal + tabs ---------- */
  function openSettings() {
    show($("settingsOverlay"));
    show($("settingsModal"));
    hydrateSettingsInputs();
    wireSettingsTabsOnce();
  }

  function closeSettings() {
    hide($("settingsModal"));
    hide($("settingsOverlay"));
  }

  $("btnSettings")?.addEventListener("click", openSettings);
  $("btnSettingsClose")?.addEventListener("click", closeSettings);
  $("settingsOverlay")?.addEventListener("click", closeSettings);

  function getNum(id, fallback = 0) {
    const el = $(id);
    if (!el) return fallback;
    return round2(Number(el.value || fallback));
  }
  function getBool(id, fallback = false) {
    const el = $(id);
    if (!el) return fallback;
    return !!el.checked;
  }
  function setVal(id, v) {
    const el = $(id);
    if (el) el.value = v;
  }
  function setChecked(id, v) {
    const el = $(id);
    if (el) el.checked = !!v;
  }

  function hydrateSettingsInputs() {
    setVal("setNextPayDate", state.nextPayDate || "");
    setVal("setSnacks", round2(state.snacks));
    setVal("setEnt", round2(state.ent));
    setVal("setTP", round2(state.tp));
    setVal("setSavings", round2(state.savings));

    // caps
    setChecked("capEnable", !!state.capsEnabled);

    // optional IDs if you've added them in HTML:
    setChecked("capTPEnable", !!state.capTPEnabled);
    setChecked("capFoodEnable", !!state.capFoodEnabled);

    setVal("capFood", round2(state.capFood));
    setVal("capEnt", round2(state.capEnt));
    setVal("capTP", round2(state.capTP));

    // advanced
    setChecked("advExcludeTue", !!state.excludeTue);
    setChecked("advExcludeWed", !!state.excludeWed);
  }

  $("btnSettingsSaveBalances")?.addEventListener("click", () => {
    state.nextPayDate = ($("setNextPayDate")?.value || "").trim();
    state.snacks = getNum("setSnacks", state.snacks);
    state.ent = getNum("setEnt", state.ent);
    state.tp = getNum("setTP", state.tp);
    state.savings = getNum("setSavings", state.savings);

    state.snackLockedDate = "";
    ensureSnackDayLock(true);

    enforceCapsSilent();
    saveState();
    renderTopCards();
    pushHistory("settings", "Saved balances/paydate");
  });

  $("btnSettingsRecalcSnack")?.addEventListener("click", () => {
    state.snackLockedDate = "";
    ensureSnackDayLock(true);
    saveState();
    renderTopCards();
    pushHistory("settings", "Recalculated today's snack limit");
  });

  $("btnSettingsSaveCaps")?.addEventListener("click", () => {
    state.capsEnabled = getBool("capEnable", state.capsEnabled);
    state.overflowToSavings = true; // always true when caps enabled

    if ($("capTPEnable")) state.capTPEnabled = getBool("capTPEnable", state.capTPEnabled);
    if ($("capFoodEnable")) state.capFoodEnabled = getBool("capFoodEnable", state.capFoodEnabled);

    state.capFood = getNum("capFood", state.capFood);
    state.capEnt = getNum("capEnt", state.capEnt);
    state.capTP = getNum("capTP", state.capTP);

    enforceCapsSilent();
    saveState();
    renderTopCards();
    hydrateSettingsInputs();
    pushHistory("settings", "Saved caps");
  });

  $("btnSettingsSaveAdvanced")?.addEventListener("click", () => {
    state.excludeTue = getBool("advExcludeTue", state.excludeTue);
    state.excludeWed = getBool("advExcludeWed", state.excludeWed);

    state.snackLockedDate = "";
    ensureSnackDayLock(true);

    saveState();
    renderTopCards();
    pushHistory("settings", "Saved advanced options");
  });

  let tabsWired = false;
  function wireSettingsTabsOnce() {
    if (tabsWired) return;
    tabsWired = true;

    const btns = Array.from(document.querySelectorAll(".tabBtn"));
    const panels = Array.from(document.querySelectorAll(".tabPanel"));
    if (!btns.length || !panels.length) return;

    function activate(tabId) {
      btns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
      panels.forEach((p) => p.classList.toggle("hidden", p.id !== tabId));
    }

    btns.forEach((b) => b.addEventListener("click", () => activate(b.dataset.tab)));
    const first = btns.find((b) => b.classList.contains("active")) || btns[0];
    if (first) activate(first.dataset.tab);
  }

  /* ---------- Calendar PTO controls (if present) ---------- */
  $("btnAddPTO")?.addEventListener("click", () => {
    const v = ($("ptoDate")?.value || "").trim();
    if (!v) return;

    state.pto = Array.isArray(state.pto) ? state.pto : [];
    if (!state.pto.includes(v)) state.pto.push(v);

    pushHistory("pto", `Added PTO: ${v}`);
    state.snackLockedDate = "";
    ensureSnackDayLock(true);

    saveState();
    renderTopCards();
    // refresh calendar screen if you're on it
    renderCalendar();
  });

  /* ---------- Boot ---------- */
  enforceCapsSilent();
  saveState();
  renderTopCards();
  switchScreen("screenToday");
  setInterval(renderTopCards, 10000);
});
