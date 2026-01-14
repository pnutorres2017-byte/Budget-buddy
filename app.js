/* ===============================
   Budget Buddy – Navigation Wiring
   =============================== */

console.log("Budget Buddy loaded", new Date().toISOString());

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
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
$("btnAdd").addEventListener("click", () => {
  openSheet(sheetAdd);
  console.log("Opened Add sheet");
});

/* ---------- Add Sheet ---------- */
$("btnOpenPurchase").addEventListener("click", () => {
  hide(sheetAdd);
  openSheet(sheetPurchase);
  console.log("Opened Purchase sheet");
});

$("btnOpenNewCheck").addEventListener("click", () => {
  hide(sheetAdd);
  openSheet(sheetNewCheck);
  console.log("Opened New Check sheet");
});

$("btnCloseSheet").addEventListener("click", closeAllSheets);

/* ---------- Purchase Sheet ---------- */
$("btnClosePurchase").addEventListener("click", closeAllSheets);

/* ---------- New Check Sheet ---------- */
$("btnCloseNewCheck").addEventListener("click", closeAllSheets);

/* ---------- Overlay ---------- */
overlay.addEventListener("click", closeAllSheets);

/* ---------- Settings ---------- */
$("btnSettings").addEventListener("click", () => {
  alert("Settings coming next");
});

/* ---------- Init ---------- */
switchScreen("today");
