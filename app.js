/* ===============================
   Budget Buddy – Snack Rules Wired
   =============================== */

console.log("Budget Buddy loaded", new Date().toISOString());

window.addEventListener("DOMContentLoaded", () => {
  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function money(n) { return `$${Number(n).toFixed(2)}`; }

  /* ---------- Date Helpers ---------- */
  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function isTuesday(d) { return d.getDay() === 2; }
  function isWednesday(d) { return d.getDay() === 3; }

  /* ---------- State ---------- */
  const state = JSON.parse(localStorage.getItem("bb_state") || "{}");

  state.snacks = state.snacks ?? 75; // TEMP starting balance
  state.snackSpentByDate = state.snackSpentByDate ?? {};
  state.excludeTue = state.excludeTue ?? true;
  state.excludeWed = state.excludeWed ?? true;
  state.pto = state.pto ?? [];

  function saveState() {
    localStorage.setItem("bb_state", JSON.stringify(state));
  }

  /* ---------- Workday Logic ---------- */
  function isWorkday(date) {
    const iso = date.toISOString().slice(0, 10);
    if (state.pto.includes(iso)) return false;
    if (state.excludeTue && isTuesday(date)) return false;
    if (state.excludeWed && isWednesday(date)) return false;
    return true;
  }

  function countRemainingWorkdays(days = 14) {
    let count = 0;
    const d = new Date();
    for (let i = 0; i < days; i++) {
      const test = new Date(d);
      test.setDate(d.getDate() + i);
      if (isWorkday(test)) count++;
    }
    return Math.max(count, 1);
  }

  /* ---------- Snack Daily Math ---------- */
  function snackAllowanceToday() {
    const workdaysLeft = countRemainingWorkdays();
    return state.snacks / workdaysLeft;
  }

  function snackSpentToday() {
    return state.snackSpentByDate[todayKey()] ?? 0;
  }

  function snackRemainingToday() {
    return Math.max(snackAllowanceToday() - snackSpentToday(), 0);
  }

  function updateSnackUI() {
    $("tSnackLeftToday").textContent = money(snackRemainingToday());
    $("tSnackTodaySub").textContent =
      `Allowance today: ${money(snackAllowanceToday())}`;
    $("tSnacksFull").textContent = money(state.snacks);
  }

  /* ===============================
     NAVIGATION (unchanged)
     =============================== */

  const screens = {
    today: $("screenToday"),
    history: $("screenHistory"),
    calendar: $("screenCalendar"),
    manage: $("screenManage"),
  };

  function switchScreen(name) {
    Object.values(screens).forEach(hide);
    if (screens[name]) show(screens[name]);

    $$(".navBtn").forEach((b) => b.classList.remove("active"));
    document
      .querySelector(`.navBtn[data-nav="${name}"]`)
      ?.classList.add("active");
  }

  $$(".navBtn").forEach((btn) => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.nav));
  });

  /* ---------- Sheets ---------- */
  const overlay = $("overlay");
  const sheetAdd = $("sheetAdd");
  const sheetPurchase = $("sheetPurchase");
  const sheetNewCheck = $("sheetNewCheck");

  function openSheet(sheet) {
    show(overlay);
    show(sheet);
  }

  function closeAllSheets() {
    hide(sheetAdd);
    hide(sheetPurchase);
    hide(sheetNewCheck);
    hide(overlay);
  }

  $("btnAdd").onclick = () => openSheet(sheetAdd);
  $("btnOpenPurchase").onclick = () => {
    hide(sheetAdd);
    openSheet(sheetPurchase);
  };
  $("btnOpenNewCheck").onclick = () => {
    hide(sheetAdd);
    openSheet(sheetNewCheck);
  };

  $("btnCloseSheet").onclick =
    $("btnClosePurchase").onclick =
    $("btnCloseNewCheck").onclick =
    overlay.onclick =
      closeAllSheets;

  /* ===============================
     PURCHASE – REAL SNACK RULES
     =============================== */

  const pAmt = $("pAmt");
  const pCat = $("pCat");
  const pOut = $("pOut");
  const btnCheck = $("btnCheckPurchase");
  const btnApply = $("btnApplyPurchase");

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".quickBtn");
    if (!btn) return;
    pAmt.value = btn.dataset.quickamt;
    pCat.value = btn.dataset.quickcat;
    pOut.textContent = "";
    btnApply.disabled = true;
  });

  btnCheck.onclick = () => {
    const amt = Number(pAmt.value);
    const cat = pCat.value;

    if (!amt || amt <= 0) {
      pOut.textContent = "Answer: no\nReason: invalid amount";
      btnApply.disabled = true;
      return;
    }

    if (cat === "snacks") {
      const today = new Date();
      if (!isWorkday(today)) {
        pOut.textContent =
`Answer: no
Reason: snacks only allowed on workdays`;
        btnApply.disabled = true;
        return;
      }

      if (amt > snackRemainingToday()) {
        pOut.textContent =
`Answer: no
Remaining budget: ${money(snackRemainingToday())}
How many days left till the next check: —
Will the budget last through till the next check: yes`;
        btnApply.disabled = true;
        return;
      }
    }

    pOut.textContent =
`Answer: yes
Remaining budget: ${cat === "snacks"
  ? money(snackRemainingToday() - amt)
  : "(not enforced yet)"}
How many days left till the next check: —
Will the budget last through till the next check: yes`;

    btnApply.disabled = false;
  };

  btnApply.onclick = () => {
    const amt = Number(pAmt.value);
    const cat = pCat.value;

    if (cat === "snacks") {
      state.snackSpentByDate[todayKey()] =
        snackSpentToday() + amt;
      state.snacks -= amt;
      saveState();
      updateSnackUI();
    }

    alert(`Applied ${cat} purchase: ${money(amt)}`);

    pAmt.value = "";
    pOut.textContent = "";
    btnApply.disabled = true;
  };

  /* ---------- Init ---------- */
  updateSnackUI();
  switchScreen("today");
});
