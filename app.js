console.log("Budget Buddy loaded", new Date().toISOString());

window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  const STORE_KEY = "bb_state_v8";

  // Caps (until configurable in Settings tabs)
  const ENT_CAP = 75;
  const SNACKS_CAP = 75;

  function show(el) { el?.classList.remove("hidden"); }
  function hide(el) { el?.classList.add("hidden"); }
// ---------- Screen rendering / bottom nav ----------
function setActiveNav(screenId) {
  $$(".bottomNav .navBtn").forEach((b) => b.classList.remove("active"));

  const btn = document.querySelector(`.bottomNav [data-screen="${screenId}"]`);
  if (btn) btn.classList.add("active");
}
function switchScreen(screenId) {
$$(".bottomNav [data-screen]").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchScreen(btn.getAttribute("data-screen"));
  });
  $$(".bottomNav [data-screen]").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchScreen(btn.getAttribute("data-screen"));
  });
});

});
  switchScreen("screenToday");
}

function switchScreen(screenId) {
  $$(".screen").forEach((sec) => {
    sec.classList.toggle("hidden", sec.id !== screenId);
  });

  setActiveNav(screenId);

  // Re-render after switching
  if (typeof renderTopCards === "function") renderTopCards();
  if (typeof renderScreen === "function") renderScreen(screenId);
}

function renderScreen(screenId) {
  // Safe no-op renders (only if you later define these)
  if (screenId === "screenHistory" && typeof renderHistory === "function") renderHistory();
  if (screenId === "screenCalendar" && typeof renderCalendar === "function") renderCalendar();
  if (screenId === "screenManage" && typeof renderManage === "function") renderManage();
}

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

  // Weekends are workdays for you. Only Tue/Wed + PTO excluded.
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

  /* ---------- UI render ---------- */
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

  /* ---------- Caps helper ---------- */
  function enforceCapsAndMoveOverflowToSavings() {
    if (state.snacks > SNACKS_CAP) {
      const overflow = round2(state.snacks - SNACKS_CAP);
      state.snacks = SNACKS_CAP;
      state.savings = round2(state.savings + overflow);
      alert(`Snacks capped at ${fmt(SNACKS_CAP)}. Moved ${fmt(overflow)} to Savings.`);
    }
    if (state.ent > ENT_CAP) {
      const overflow = round2(state.ent - ENT_CAP);
      state.ent = ENT_CAP;
      state.savings = round2(state.savings + overflow);
      alert(`Entertainment capped at ${fmt(ENT_CAP)}. Moved ${fmt(overflow)} to Savings.`);
    }
  }

  /* ---------- Settings (balances + payday + caps) ---------- */
  $("btnSettings")?.addEventListener("click", () => {
    const nextPay = prompt("Next paycheck date (YYYY-MM-DD):", state.nextPayDate || "");
    if (nextPay !== null) state.nextPayDate = nextPay.trim();

    const snacks = prompt(`Snacks balance (cap ${SNACKS_CAP}):`, String(state.snacks));
    if (snacks !== null) state.snacks = round2(Number(snacks));

    const ent = prompt(`Entertainment balance (cap ${ENT_CAP}):`, String(state.ent));
    if (ent !== null) state.ent = round2(Number(ent));

    const tp = prompt("TP balance:", String(state.tp));
    if (tp !== null) state.tp = round2(Number(tp));

    const savings = prompt("Savings balance:", String(state.savings));
    if (savings !== null) state.savings = round2(Number(savings));

    enforceCapsAndMoveOverflowToSavings();

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
        if (state.snacks >= SNACKS_CAP) {
          reason = `Note: snacks are capped at ${fmt(SNACKS_CAP)} (overflow goes to savings when funding).`;
        }
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
        if (state.ent >= ENT_CAP) {
          reason = `Note: entertainment is capped at ${fmt(ENT_CAP)} (overflow goes to savings when funding).`;
        }
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

    if (pAmt) pAmt.value = "";
    if (pOut) pOut.textContent = "";
    btnApply.disabled = true;
    lastDecision = { ok: false, cat: "", amt: 0 };

    alert("Applied.");
  });

  /* ---------- New Check Preview (restored) ---------- */
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

    // Preview only — no balances are changed
    if (cOut) {
      cOut.textContent =
`NEW CHECK PREVIEW

Deposit: ${fmt(deposit)}
Next paycheck: ${nextPay}
Debt (reported): ${fmt(debt)}

(Caps in effect: Snacks ${fmt(SNACKS_CAP)}, Entertainment ${fmt(ENT_CAP)})
(No balances have been changed)`;
    }

    // Still disabled until we explicitly wire apply later
    if (btnApplyCheck) btnApplyCheck.disabled = true;
  });

  btnApplyCheck?.addEventListener("click", () => {
    alert("Apply not enabled yet.");
  });

  /* ---------- Init ---------- */
  renderTopCards();
  switchScreen("today");
  setInterval(renderTopCards, 10000);
});
/* =========================
   SETTINGS + TABS WIRING (v1)
   Paste at bottom of app.js
   ========================= */

(() => {
  const $ = (id) => document.getElementById(id);

  // Use existing STORE_KEY if your app already defines it, otherwise fall back safely.
  const KEY = (typeof STORE_KEY !== "undefined" && STORE_KEY) ? STORE_KEY : "bb_state_v8";

  const DEFAULTS = {
    nextPayDate: "",

    snacks: 0,
    ent: 0,
    tp: 0,
    savings: 0,

    // caps
    capsEnabled: true,
    overflowToSavings: true,
    capSnacks: 75,
    capEnt: 75,
    capTP: 100,

    // advanced
    excludeTue: true,
    excludeWed: true
  };

  function loadStateSafe() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveStateSafe(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function fmt(n) {
    return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function iso(d) {
    // midnight local
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x.toISOString().slice(0,10);
  }

  function isTuesday(d){ return d.getDay() === 2; }
  function isWednesday(d){ return d.getDay() === 3; }

  function daysBetween(a, b) {
    const A = new Date(a); A.setHours(0,0,0,0);
    const B = new Date(b); B.setHours(0,0,0,0);
    return Math.max(0, Math.round((B - A) / 86400000));
  }

  function countWorkdaysFromTodayToNextPay(state) {
    if (!state.nextPayDate) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(state.nextPayDate); end.setHours(0,0,0,0);
    if (end <= today) return 0;

    let count = 0;
    for (let d = new Date(today); d < end; d.setDate(d.getDate() + 1)) {
      // Workdays are EVERY day except Tue/Wed (per your rule)
      if (state.excludeTue && isTuesday(d)) continue;
      if (state.excludeWed && isWednesday(d)) continue;
      count++;
    }
    return count;
  }

  function todaySnackAllowance(state) {
    // If excluded day -> 0
    const today = new Date(); today.setHours(0,0,0,0);
    if (state.excludeTue && isTuesday(today)) return 0;
    if (state.excludeWed && isWednesday(today)) return 0;

    const workdaysLeft = countWorkdaysFromTodayToNextPay(state);
    if (workdaysLeft <= 0) return 0;

    // simple allowance: evenly divide remaining snacks across remaining workdays
    return round2((Number(state.snacks) || 0) / workdaysLeft);
  }

  function enforceCaps(state) {
    if (!state.capsEnabled) return state;

    const caps = {
      snacks: Number(state.capSnacks) || 0,
      ent: Number(state.capEnt) || 0,
      tp: Number(state.capTP) || 0
    };

    function capOne(key, cap) {
      if (cap <= 0) return;
      const val = Number(state[key]) || 0;
      if (val > cap) {
        const overflow = round2(val - cap);
        state[key] = cap;
        if (state.overflowToSavings) {
          state.savings = round2((Number(state.savings) || 0) + overflow);
        }
      }
    }

    capOne("snacks", caps.snacks);
    capOne("ent", caps.ent);
    capOne("tp", caps.tp);

    return state;
  }

  function renderTopCards(state) {
    // These IDs exist in your new index.html
    const elToday = $("todaySnacksLeft");
    const elEnt = $("balEnt");
    const elTP = $("balTP");
    const elSnacks = $("balSnacks");
    const elSav = $("balSavings");

    if (elEnt) elEnt.textContent = fmt(state.ent);
    if (elTP) elTP.textContent = fmt(state.tp);
    if (elSnacks) elSnacks.textContent = fmt(state.snacks);
    if (elSav) elSav.textContent = fmt(state.savings);

    if (elToday) {
      const allowance = todaySnackAllowance(state);
      elToday.textContent = fmt(allowance);
    }
  }

  function hydrateSettingsInputs(state) {
    // balances tab
    if ($("setNextPayDate")) $("setNextPayDate").value = state.nextPayDate || "";
    if ($("setSnacks")) $("setSnacks").value = round2(state.snacks);
    if ($("setEnt")) $("setEnt").value = round2(state.ent);
    if ($("setTP")) $("setTP").value = round2(state.tp);
    if ($("setSavings")) $("setSavings").value = round2(state.savings);

    // caps tab
    if ($("capEnable")) $("capEnable").checked = !!state.capsEnabled;
    if ($("capOverflowToSavings")) $("capOverflowToSavings").checked = !!state.overflowToSavings;
    if ($("capSnacks")) $("capSnacks").value = round2(state.capSnacks);
    if ($("capEnt")) $("capEnt").value = round2(state.capEnt);
    if ($("capTP")) $("capTP").value = round2(state.capTP);

    // advanced tab
    if ($("advExcludeTue")) $("advExcludeTue").checked = !!state.excludeTue;
    if ($("advExcludeWed")) $("advExcludeWed").checked = !!state.excludeWed;
  }

  function openSettings() {
    const overlay = $("settingsOverlay");
    const modal = $("settingsModal");
    if (overlay) overlay.classList.remove("hidden");
    if (modal) modal.classList.remove("hidden");

    const state = loadStateSafe();
    hydrateSettingsInputs(state);
  }

  function closeSettings() {
    const overlay = $("settingsOverlay");
    const modal = $("settingsModal");
    if (overlay) overlay.classList.add("hidden");
    if (modal) modal.classList.add("hidden");
  }

  function wireTabs() {
    const btns = Array.from(document.querySelectorAll(".tabBtn"));
    const panels = Array.from(document.querySelectorAll(".tabPanel"));

    if (!btns.length || !panels.length) return;

    function activate(tabId) {
      btns.forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
      panels.forEach(p => p.classList.toggle("hidden", p.id !== tabId));
    }

    btns.forEach(b => {
      b.addEventListener("click", () => activate(b.dataset.tab));
    });

    // ensure first tab visible
    const first = btns.find(b => b.classList.contains("active")) || btns[0];
    if (first) activate(first.dataset.tab);
  }

  function wireSettingsButtons() {
    const btnOpen = $("btnSettings");
    const btnClose = $("btnSettingsClose");
    const overlay = $("settingsOverlay");

    if (btnOpen) btnOpen.addEventListener("click", openSettings);
    if (btnClose) btnClose.addEventListener("click", closeSettings);
    if (overlay) overlay.addEventListener("click", closeSettings);

    const btnSaveBalances = $("btnSettingsSaveBalances");
    const btnRecalcSnack = $("btnSettingsRecalcSnack");
    const btnSaveCaps = $("btnSettingsSaveCaps");
    const btnSaveAdvanced = $("btnSettingsSaveAdvanced");

    if (btnSaveBalances) {
      btnSaveBalances.addEventListener("click", () => {
        const state = loadStateSafe();

        state.nextPayDate = ($("setNextPayDate")?.value || "").trim();

        state.snacks = round2($("setSnacks")?.value || 0);
        state.ent = round2($("setEnt")?.value || 0);
        state.tp = round2($("setTP")?.value || 0);
        state.savings = round2($("setSavings")?.value || 0);

        enforceCaps(state);
        saveStateSafe(state);
        renderTopCards(state);
      });
    }

    if (btnRecalcSnack) {
      btnRecalcSnack.addEventListener("click", () => {
        const state = loadStateSafe();
        renderTopCards(state);
      });
    }

    if (btnSaveCaps) {
      btnSaveCaps.addEventListener("click", () => {
        const state = loadStateSafe();

        state.capsEnabled = !!$("capEnable")?.checked;
        state.overflowToSavings = !!$("capOverflowToSavings")?.checked;

        state.capSnacks = round2($("capSnacks")?.value || 0);
        state.capEnt = round2($("capEnt")?.value || 0);
        state.capTP = round2($("capTP")?.value || 0);

        enforceCaps(state);
        saveStateSafe(state);
        renderTopCards(state);
        hydrateSettingsInputs(state); // show capped balances if they got trimmed
      });
    }

    if (btnSaveAdvanced) {
      btnSaveAdvanced.addEventListener("click", () => {
        const state = loadStateSafe();
        state.excludeTue = !!$("advExcludeTue")?.checked;
        state.excludeWed = !!$("advExcludeWed")?.checked;
        saveStateSafe(state);
        renderTopCards(state);
      });
    }
  }

  // Run after DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    const state = loadStateSafe();
    enforceCaps(state);
    saveStateSafe(state);
    renderTopCards(state);

    wireTabs();
    wireSettingsButtons();
  });
})();
