/* ===============================
   Budget Buddy – Navigation + Purchase Wiring
   =============================== */

console.log("Budget Buddy loaded", new Date().toISOString());

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

/* ---------- Screens ---------- */
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
  const active = document.querySelector(`.navBtn[data-nav="${name}"]`);
  if (active) active.classList.add("active");

  console.log("Switched to screen:", name);
}

/* ---------- Bottom Nav ---------- */
$$(".navBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchScreen(btn.dataset.nav);
  });
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
$("btnAdd").addEventListener("click", () => openSheet(sheetAdd));

$("btnOpenPurchase").addEventListener("click", () => {
  hide(sheetAdd);
  openSheet(sheetPurchase);
});

$("btnOpenNewCheck").addEventListener("click", () => {
  hide(sheetAdd);
  openSheet(sheetNewCheck);
});

$("btnCloseSheet").addEventListener("click", closeAllSheets);
$("btnClosePurchase").addEventListener("click", closeAllSheets);
$("btnCloseNewCheck").addEventListener("click", closeAllSheets);
overlay.addEventListener("click", closeAllSheets);

/* ---------- Settings ---------- */
$("btnSettings").addEventListener("click", () => {
  alert("Settings wiring next");
});

/* ===============================
   PURCHASE WIRING (SAFE MODE)
   =============================== */

const pAmt = $("pAmt");
const pCat = $("pCat");
const pOut = $("pOut");
const btnCheck = $("btnCheckPurchase");
const btnApply = $("btnApplyPurchase");

/* Quick purchase buttons */
$$(".quickBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    pAmt.value = btn.dataset.quickamt;
    pCat.value = btn.dataset.quickcat;
    pOut.textContent = "";
    btnApply.disabled = true;

    console.log("Quick purchase selected", btn.dataset.quickcat, btn.dataset.quickamt);
  });
});

/* Check purchase */
btnCheck.addEventListener("click", () => {
  const amt = parseFloat(pAmt.value);
  const cat = pCat.value;

  if (!amt || amt <= 0) {
    pOut.textContent = "Answer: no\nReason: invalid amount";
    btnApply.disabled = true;
    return;
  }

  // TEMP RULE: allow all purchases for now
  const daysLeft = 14; // placeholder
  const willLast = true;

  pOut.textContent =
`Answer: yes
Remaining budget: (not calculated yet)
How many days left till the next check: ${daysLeft}
Will the budget last through till the next check: ${willLast ? "yes" : "no"}`;

  btnApply.disabled = false;

  console.log("Purchase checked", { amt, cat });
});

/* Apply purchase (no money moves yet) */
btnApply.addEventListener("click", () => {
  const amt = parseFloat(pAmt.value);
  const cat = pCat.value;

  alert(`Applied ${cat} purchase: $${amt.toFixed(2)} (simulation only)`);

  console.log("Purchase applied (simulated)", { amt, cat });

  pAmt.value = "";
  pOut.textContent = "";
  btnApply.disabled = true;
});

/* ---------- Init ---------- */
switchScreen("today");
