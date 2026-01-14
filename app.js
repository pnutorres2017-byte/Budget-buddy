/* ===============================
   Budget Buddy – Navigation + Purchase + New Check Preview
   =============================== */

console.log("Budget Buddy loaded", new Date().toISOString());

window.addEventListener("DOMContentLoaded", () => {
  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function money(n) {
    return `$${Number(n).toFixed(2)}`;
  }

  /* ---------- Screens ---------- */
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
    const active = document.querySelector(`.navBtn[data-nav="${name}"]`);
    if (active) active.classList.add("active");
  }

  /* ---------- Bottom Nav ---------- */
  $$(".navBtn").forEach((btn) => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.nav));
  });

  /* ---------- Overlay + Sheets ---------- */
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

  /* ---------- FAB (+) ---------- */
  $("btnAdd")?.addEventListener("click", () => openSheet(sheetAdd));

  $("btnOpenPurchase")?.addEventListener("click", () => {
    hide(sheetAdd);
    openSheet(sheetPurchase);
  });

  $("btnOpenNewCheck")?.addEventListener("click", () => {
    hide(sheetAdd);
    openSheet(sheetNewCheck);
  });

  $("btnCloseSheet")?.addEventListener("click", closeAllSheets);
  $("btnClosePurchase")?.addEventListener("click", closeAllSheets);
  $("btnCloseNewCheck")?.addEventListener("click", closeAllSheets);
  overlay?.addEventListener("click", closeAllSheets);

  /* ---------- Settings ---------- */
  $("btnSettings")?.addEventListener("click", () => {
    alert("Settings wiring later");
  });

  /* ===============================
     PURCHASE (already working)
     =============================== */

  const pAmt = $("pAmt");
  const pCat = $("pCat");
  const pOut = $("pOut");
  const btnCheckPurchase = $("btnCheckPurchase");
  const btnApplyPurchase = $("btnApplyPurchase");

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".quickBtn");
    if (!btn) return;

    pAmt.value = btn.dataset.quickamt;
    pCat.value = btn.dataset.quickcat;
    pOut.textContent = "";
    btnApplyPurchase.disabled = true;
  });

  btnCheckPurchase?.addEventListener("click", () => {
    const amt = Number(pAmt.value);

    if (!amt || amt <= 0) {
      pOut.textContent = "Answer: no\nReason: invalid amount";
      btnApplyPurchase.disabled = true;
      return;
    }

    pOut.textContent =
`Answer: yes
Remaining budget: (not calculated yet)
How many days left till the next check: 14
Will the budget last through till the next check: yes`;

    btnApplyPurchase.disabled = false;
  });

  btnApplyPurchase?.addEventListener("click", () => {
    alert("Purchase applied (simulation only)");
    pAmt.value = "";
    pOut.textContent = "";
    btnApplyPurchase.disabled = true;
  });

  /* ===============================
     NEW CHECK – PREVIEW ONLY
     =============================== */

  const cDeposit = $("cDeposit");
  const cNextPay = $("cNextPay");
  const cDebt = $("cDebt");
  const cOut = $("cOut");
  const btnPreviewCheck = $("btnPreviewCheck");
  const btnApplyCheck = $("btnApplyCheck");

  btnPreviewCheck?.addEventListener("click", () => {
    const deposit = Number(cDeposit.value);
    const debt = Number(cDebt.value);
    const nextPay = cNextPay.value;

    if (!deposit || deposit <= 0 || !nextPay) {
      cOut.textContent = "Please enter a valid deposit and next paycheck date.";
      btnApplyCheck.disabled = true;
      return;
    }

    // Placeholder assumptions (safe)
    const billsDue = 0;
    const savings = deposit * 0.3;
    const tp = 50;
    const snacks = 75;
    const entertainment = 75;

    const allocated =
      billsDue + savings + tp + snacks + entertainment;

    const remainder = deposit - allocated;

    cOut.textContent =
`NEW CHECK PREVIEW

Deposit: ${money(deposit)}
Next paycheck: ${nextPay}

Bills due before next check:
${money(billsDue)}

Proposed split:
Savings: ${money(savings)}
TP fund: ${money(tp)}
Snacks: ${money(snacks)}
Entertainment: ${money(entertainment)}

Debt remaining (reported): ${money(debt)}

Unallocated remainder:
${money(remainder)}

(No balances have been changed)`;

    btnApplyCheck.disabled = false;
  });

  // Apply still disabled on purpose
  btnApplyCheck?.addEventListener("click", () => {
    alert("Apply will be enabled in a later step");
  });

  /* ---------- Init ---------- */
  switchScreen("today");
});
