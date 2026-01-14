const KEY = "budget_buddy_v2";
const $ = (id) => document.getElementById(id);

const fmt = (n) => (Number(n||0)).toLocaleString(undefined,{style:"currency",currency:"USD"});
const round2 = (n) => Math.round((Number(n)+Number.EPSILON)*100)/100;

function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function isoDay(d){ return startOfDay(d).toISOString().slice(0,10); }
function daysBetween(a,b){
  const ms = startOfDay(b) - startOfDay(a);
  return Math.max(0, Math.round(ms/86400000));
}

function defaultState(){
  return {
    // core balances
    holding: 0,
    savings: 0,
    tp: 0,
    snacks: 0,
    ent: 0,

    // debt (only Current + Cash App + Tilt)
    totalDebt: 0,

    // snack daily lock
    snackLockedDate: "",
    snackCapToday: 0,
    snackSpentToday: 0,

    // pay period
    nextPayDate: "",

    // settings
    savingsPct: 35,
    tpFixed: 50,
    tpCap: 100,
    snacksFixed: 75,
    entFixed: 75,
    snackCapWhileDebt: 75,
    entCapWhileDebt: 75,
    debtChunk: 25,
    excludeTue: true,
    excludeWed: true,

    // temporary PTO dates (YYYY-MM-DD)
    pto: [], // {date, label}

    // bills list (includes subscriptions; NOT counted as debt)
    bills: [
      // {name, amount, dueType:"once"|"monthly"|"weekly", dueDate:"YYYY-MM-DD" OR dayOfMonth:12 OR dayOfWeek:1, label}
    ],

    lastSaved: ""
  };
}

function load(){
  const raw = localStorage.getItem(KEY);
  if(!raw) return defaultState();
  try { return JSON.parse(raw); } catch { return defaultState(); }
}
function save(){
  state.lastSaved = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

let state = load();

function cleanExpiredPTO(){
  const today = isoDay(new Date());
  const before = state.pto.length;
  state.pto = state.pto.filter(x => x.date >= today);
  if(state.pto.length !== before) save();
}

function isExcludedWorkday(date){
  const d = date.getDay(); // 0 Sun ... 2 Tue ... 3 Wed
  if(state.excludeTue && d===2) return true;
  if(state.excludeWed && d===3) return true;
  const dayISO = isoDay(date);
  if(state.pto.some(x => x.date === dayISO)) return true;
  return false;
}

function countWorkdays(fromDate, toDate, includeFrom=false){
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  let c=0;
  for(let d=new Date(from); d<=to; d.setDate(d.getDate()+1)){
    if(!includeFrom && isoDay(d)===isoDay(from)) continue;
    if(!isExcludedWorkday(d)) c++;
  }
  return c;
}

function ensureSnackDayLock(){
  cleanExpiredPTO();

  const today = new Date();
  const tISO = isoDay(today);

  if(state.snackLockedDate === tISO) return;

  // new day
  state.snackLockedDate = tISO;
  state.snackSpentToday = 0;

  const next = state.nextPayDate ? new Date(state.nextPayDate+"T00:00:00") : null;
  const todayIsWorkday = !isExcludedWorkday(today);

  if(!next || !todayIsWorkday){
    state.snackCapToday = 0;
  } else {
    const workdaysLeft = countWorkdays(today, next, false);
    state.snackCapToday = workdaysLeft>0 ? round2(state.snacks / workdaysLeft) : 0;
  }
}

function switchTab(name){
  ["Today","Check","Debt"].forEach(n=>{
    $("tab"+n).classList.toggle("hidden", n!==name);
    document.querySelector(`.navBtn[data-tab="${n}"]`).classList.toggle("active", n===name);
  });
}

function openDrawer(open){
  $("drawer").classList.toggle("hidden", !open);
  $("drawerBackdrop").classList.toggle("hidden", !open);
}

function billRowTemplate(b, idx){
  return `
  <div class="stat" style="padding:10px;">
    <div class="grid3">
      <div>
        <label>Name</label>
        <input data-bill="${idx}" data-k="name" value="${b.name||""}" placeholder="e.g. Verizon">
      </div>
      <div>
        <label>Amount</label>
        <input data-bill="${idx}" data-k="amount" type="number" step="0.01" value="${b.amount ?? ""}" placeholder="0.00">
      </div>
      <div>
        <label>Type</label>
        <select data-bill="${idx}" data-k="dueType">
          <option value="once" ${b.dueType==="once"?"selected":""}>One-time</option>
          <option value="monthly" ${b.dueType==="monthly"?"selected":""}>Monthly</option>
          <option value="weekly" ${b.dueType==="weekly"?"selected":""}>Weekly</option>
        </select>
      </div>
    </div>

    <div class="grid3" style="margin-top:10px;">
      <div>
        <label>Due date (one-time)</label>
        <input data-bill="${idx}" data-k="dueDate" type="date" value="${b.dueDate||""}">
      </div>
      <div>
        <label>Day of month (monthly)</label>
        <input data-bill="${idx}" data-k="dayOfMonth" type="number" step="1" min="1" max="31" value="${b.dayOfMonth ?? ""}" placeholder="12">
      </div>
      <div>
        <label>Day of week (weekly)</label>
        <select data-bill="${idx}" data-k="dayOfWeek">
          ${[0,1,2,3,4,5,6].map(d=>{
            const names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            return `<option value="${d}" ${(Number(b.dayOfWeek)===d)?"selected":""}>${names[d]}</option>`;
          }).join("")}
        </select>
      </div>
    </div>

    <div class="row" style="justify-content:space-between;margin-top:10px;">
      <div class="muted">Shows up automatically each cycle.</div>
      <button class="danger" data-delbill="${idx}">Delete</button>
    </div>
  </div>`;
}

function nextOccurrenceForBill(b, today){
  const t = startOfDay(today);
  const nextPay = state.nextPayDate ? new Date(state.nextPayDate+"T00:00:00") : null;

  if(b.dueType==="once"){
    if(!b.dueDate) return null;
    const d = new Date(b.dueDate+"T00:00:00");
    return d;
  }

  if(b.dueType==="monthly"){
    const dom = Number(b.dayOfMonth);
    if(!dom || dom<1 || dom>31) return null;

    // try this month, else next month
    let y=t.getFullYear(), m=t.getMonth();
    const tryDate = (yy,mm) => new Date(yy,mm,Math.min(dom, daysInMonth(yy,mm)));
    let d = tryDate(y,m);
    if(d < t) { m+=1; if(m>11){m=0;y+=1;} d = tryDate(y,m); }
    return d;
  }

  if(b.dueType==="weekly"){
    const dow = Number(b.dayOfWeek);
    if(dow<0 || dow>6) return null;
    let d = new Date(t);
    for(let i=0;i<14;i++){
      if(d.getDay()===dow && d>=t) return d;
      d.setDate(d.getDate()+1);
    }
    return null;
  }

  return null;
}

function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }

function buildDueList(){
  const today = new Date();
  const nextPay = state.nextPayDate ? new Date(state.nextPayDate+"T00:00:00") : null;
  if(!nextPay) return {due:[], total:0};

  const due = [];
  for(const b of state.bills){
    const occ = nextOccurrenceForBill(b, today);
    if(!occ) continue;
    // include if due before next check date (strictly before next check)
    if(occ < nextPay){
      due.push({
        name: b.name || "Bill",
        amount: Number(b.amount||0),
        dueDate: isoDay(occ),
        status: (occ <= startOfDay(today)) ? "DUE NOW" : "UPCOMING"
      });
    }
  }
  const total = round2(due.reduce((s,x)=>s+Number(x.amount||0),0));
  due.sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  return {due, total};
}

function paydayPlan(){
  ensureSnackDayLock();

  const deposit = round2(Number($("inDeposit").value||0));
  const debt = round2(Number($("inDebt").value||0));
  const nextPay = $("inNextPay").value;

  state.totalDebt = debt;
  state.nextPayDate = nextPay;

  const {due, total:holdingNeed} = buildDueList();

  // Step 1: fund Bills Holding for due-before-next-check
  const moveToHolding = Math.min(deposit, holdingNeed);
  state.holding = round2(state.holding + moveToHolding);

  let remaining = round2(deposit - moveToHolding);

  // Step 2+: split remaining using your system
  // Savings %
  const savingsAdd = round2(remaining * (state.savingsPct/100));
  state.savings = round2(state.savings + savingsAdd);
  remaining = round2(remaining - savingsAdd);

  // TP fixed with cap
  const tpRoom = Math.max(0, round2(state.tpCap - state.tp));
  const tpAdd = round2(Math.min(state.tpFixed, tpRoom, remaining));
  state.tp = round2(state.tp + tpAdd);
  remaining = round2(remaining - tpAdd);

  // Snacks + Ent with caps while debt > 0
  const debtActive = state.totalDebt > 0;

  let snacksAdd = 0;
  if(remaining > 0){
    if(debtActive){
      const room = Math.max(0, round2(state.snackCapWhileDebt - state.snacks));
      snacksAdd = round2(Math.min(state.snacksFixed, room, remaining));
    } else {
      snacksAdd = round2(Math.min(state.snacksFixed, remaining));
    }
    state.snacks = round2(state.snacks + snacksAdd);
    remaining = round2(remaining - snacksAdd);
  }

  let entAdd = 0;
  if(remaining > 0){
    if(debtActive){
      const room = Math.max(0, round2(state.entCapWhileDebt - state.ent));
      entAdd = round2(Math.min(state.entFixed, room, remaining));
    } else {
      entAdd = round2(Math.min(state.entFixed, remaining));
    }
    state.ent = round2(state.ent + entAdd);
    remaining = round2(remaining - entAdd);
  }

  // Debt paydown in chunks (reduces totalDebt)
  const chunk = Math.max(1, Math.floor(Number(state.debtChunk||25)));
  const debtPay = round2(Math.min(state.totalDebt, Math.floor(remaining / chunk) * chunk));
  state.totalDebt = round2(state.totalDebt - debtPay);
  remaining = round2(remaining - debtPay);

  // Leftover -> savings
  state.savings = round2(state.savings + remaining);
  const leftoverToSavings = remaining;
  remaining = 0;

  save();
  ensureSnackDayLock();

  // Output instructions
  const lines = [];
  lines.push(`Deposit: ${fmt(deposit)}`);
  lines.push(`Next check: ${state.nextPayDate || "—"}`);
  lines.push("");
  lines.push(`Move to Bills Holding: ${fmt(moveToHolding)} (needed: ${fmt(holdingNeed)})`);
  if(due.length){
    due.forEach(x=>lines.push(`- ${x.status}: ${x.name} ${fmt(x.amount)} (due ${x.dueDate})`));
  } else {
    lines.push(`- No bills/debts due before next check (based on your list).`);
  }
  if(moveToHolding < holdingNeed){
    lines.push(`⚠ Short by ${fmt(holdingNeed - moveToHolding)} — bills holding not fully funded.`);
  }

  lines.push("");
  lines.push(`Then move the remaining money like this:`);
  lines.push(`- Savings: +${fmt(savingsAdd)}${leftoverToSavings ? ` (+${fmt(leftoverToSavings)} leftover)` : ""}`);
  lines.push(`- TP fund: +${fmt(tpAdd)} (cap ${fmt(state.tpCap)})`);
  lines.push(`- Snacks: +${fmt(snacksAdd)}${debtActive ? ` (cap ${fmt(state.snackCapWhileDebt)} while debt>0)` : ""}`);
  lines.push(`- Entertainment: +${fmt(entAdd)}${debtActive ? ` (cap ${fmt(state.entCapWhileDebt)} while debt>0)` : ""}`);
  lines.push(`- Debt paydown: ${fmt(debtPay)} (in $${chunk} chunks)`);
  lines.push("");
  lines.push(`Updated totals:`);
  lines.push(`Bills Holding: ${fmt(state.holding)}`);
  lines.push(`Savings: ${fmt(state.savings)}`);
  lines.push(`TP: ${fmt(state.tp)}`);
  lines.push(`Snacks: ${fmt(state.snacks)}`);
  lines.push(`Entertainment: ${fmt(state.ent)}`);
  lines.push(`Total Debt Remaining: ${fmt(state.totalDebt)}`);

  $("checkOut").textContent = lines.join("\n");
}

let lastDecision = null;

function checkPurchase(){
  ensureSnackDayLock();

  const amt = round2(Number($("buyAmt").value||0));
  const cat = $("buyCat").value;

  const now = new Date();
  const nextPay = state.nextPayDate ? new Date(state.nextPayDate+"T00:00:00") : null;
  const daysLeft = nextPay ? daysBetween(now, nextPay) : 0;

  let ok = true;
  let remainingBudget = 0;

  if(cat==="snacks"){
    const todayIsWorkday = !isExcludedWorkday(now);
    const leftToday = round2(Math.max(0, state.snackCapToday - state.snackSpentToday));
    remainingBudget = round2(state.snacks);

    if(!todayIsWorkday) ok = false;
    if(amt > leftToday) ok = false;
    if(amt > remainingBudget) ok = false;
  } else if(cat==="ent"){
    remainingBudget = round2(state.ent);
    if(amt > remainingBudget) ok = false;
  } else if(cat==="tp"){
    remainingBudget = round2(state.tp);
    if(amt > remainingBudget) ok = false;
  }

  const out = [
    `Answer: ${ok ? "yes" : "no"}`,
    `Remaining budget: ${fmt(ok ? round2(remainingBudget - amt) : remainingBudget)}`,
    `How many days left till the next check: ${nextPay ? daysLeft : "—"}`,
    `Will the budget last through till the next check: ${ok ? "yes" : "no"}`
  ].join("\n");

  $("buyOut").textContent = out;
  $("btnApplyBuy").disabled = !ok;
  lastDecision = {ok, amt, cat};
}

function applyPurchase(){
  if(!lastDecision || !lastDecision.ok) return;
  const {amt, cat} = lastDecision;

  if(cat==="snacks"){
    state.snacks = round2(state.snacks - amt);
    state.snackSpentToday = round2(state.snackSpentToday + amt);
  } else if(cat==="ent"){
    state.ent = round2(state.ent - amt);
  } else if(cat==="tp"){
    state.tp = round2(state.tp - amt);
  }

  save();
  ensureSnackDayLock();
  $("btnApplyBuy").disabled = true;
  $("buyAmt").value = "";
  $("buyOut").textContent = "";
}

function renderBills(){
  const wrap = $("billList");
  wrap.innerHTML = state.bills.map((b,i)=>billRowTemplate(b,i)).join("");

  wrap.querySelectorAll("[data-bill]").forEach(el=>{
    el.addEventListener("input", (e)=>{
      const i = Number(e.target.dataset.bill);
      const k = e.target.dataset.k;
      if(k==="amount") state.bills[i][k] = Number(e.target.value||0);
      else if(k==="dayOfMonth") state.bills[i][k] = Number(e.target.value||0);
      else if(k==="dayOfWeek") state.bills[i][k] = Number(e.target.value||0);
      else state.bills[i][k] = e.target.value;
      save();
    });
    el.addEventListener("change", (e)=>{
      const i = Number(e.target.dataset.bill);
      const k = e.target.dataset.k;
      state.bills[i][k] = e.target.value;
      save();
    });
  });

  wrap.querySelectorAll("[data-delbill]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.dataset.delbill);
      state.bills.splice(i,1);
      save();
      renderBills();
    });
  });
}

function renderPTO(){
  const wrap = $("ptoList");
  wrap.innerHTML = state.pto
    .sort((a,b)=>a.date.localeCompare(b.date))
    .map((x,i)=>`
      <div class="stat" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700">${x.date}</div>
          <div class="muted">${x.label||""}</div>
        </div>
        <button class="danger" data-delpto="${i}">Delete</button>
      </div>
    `).join("");

  wrap.querySelectorAll("[data-delpto]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.dataset.delpto);
      state.pto.splice(i,1);
      save();
      ensureSnackDayLock();
    });
  });
}

function render(){
  ensureSnackDayLock();

  const now = new Date();
  const nextPay = state.nextPayDate ? new Date(state.nextPayDate+"T00:00:00") : null;
  const daysLeft = nextPay ? daysBetween(now, nextPay) : 0;
  const workdaysLeft = nextPay ? countWorkdays(now, nextPay, false) : 0;

  $("subLine").textContent = `Today: ${now.toLocaleDateString()} • Snack lock: ${state.snackLockedDate || "—"}`;

  // Today tab
  $("daysLeft").textContent = nextPay ? String(daysLeft) : "—";
  $("workdaysLeft").textContent = nextPay ? String(workdaysLeft) : "—";
  $("lockedDay").textContent = state.snackLockedDate || "—";

  $("snackCapToday").textContent = fmt(state.snackCapToday);
  $("snackLeftToday").textContent = fmt(Math.max(0, round2(state.snackCapToday - state.snackSpentToday)));

  $("balHolding").textContent = fmt(state.holding);
  $("balDebt").textContent = fmt(state.totalDebt);
  $("balSavings").textContent = fmt(state.savings);
  $("balTP").textContent = fmt(state.tp);
  $("balSnacks").textContent = fmt(state.snacks);
  $("balEnt").textContent = fmt(state.ent);

  // New check defaults
  $("inNextPay").value = state.nextPayDate || "";
  $("inDebt").value = state.totalDebt || "";

  // Debt tab
  $("debtBig").textContent = fmt(state.totalDebt);

  // Settings
  $("setSavingsPct").value = state.savingsPct;
  $("setTPFixed").value = state.tpFixed;
  $("setSnacksFixed").value = state.snacksFixed;
  $("setEntFixed").value = state.entFixed;
  $("setTPCap").value = state.tpCap;
  $("setSnackCap").value = state.snackCapWhileDebt;
  $("setEntCap").value = state.entCapWhileDebt;
  $("setDebtChunk").value = state.debtChunk;

  $("exTue").checked = !!state.excludeTue;
  $("exWed").checked = !!state.excludeWed;

  $("lastSaved").textContent = state.lastSaved ? `Last saved: ${new Date(state.lastSaved).toLocaleString()}` : "—";

  renderBills();
  renderPTO();
}

function exportCode(){
  const data = JSON.stringify(state);
  navigator.clipboard.writeText(data);
  alert("Export copied to clipboard.");
}
function exportFile(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "budget-buddy-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function importCode(){
  const raw = $("importBox").value.trim();
  if(!raw) return;
  try{
    const parsed = JSON.parse(raw);
    state = parsed;
    localStorage.setItem(KEY, JSON.stringify(state));
    alert("Imported.");
    render();
  }catch{
    alert("Import failed: invalid code.");
  }
}
function resetAll(){
  if(!confirm("Reset everything on this device?")) return;
  localStorage.removeItem(KEY);
  state = defaultState();
  save();
}

function addBill(){
  state.bills.push({name:"", amount:0, dueType:"monthly", dayOfMonth:1});
  save();
  renderBills();
}

function addPTO(){
  const date = $("ptoDate").value;
  const label = $("ptoLabel").value || "";
  if(!date) return;
  if(!state.pto.some(x=>x.date===date)){
    state.pto.push({date, label});
    $("ptoDate").value = "";
    $("ptoLabel").value = "";
    save();
    ensureSnackDayLock();
  }
}

function saveSettings(){
  state.savingsPct = Number($("setSavingsPct").value||35);
  state.tpFixed = Number($("setTPFixed").value||50);
  state.snacksFixed = Number($("setSnacksFixed").value||75);
  state.entFixed = Number($("setEntFixed").value||75);
  state.tpCap = Number($("setTPCap").value||100);
  state.snackCapWhileDebt = Number($("setSnackCap").value||75);
  state.entCapWhileDebt = Number($("setEntCap").value||75);
  state.debtChunk = Number($("setDebtChunk").value||25);

  state.excludeTue = $("exTue").checked;
  state.excludeWed = $("exWed").checked;

  save();
  ensureSnackDayLock();
  alert("Saved.");
}

function applyDebtPaid(amount){
  const a = round2(Number(amount||0));
  if(a<=0) return;
  state.totalDebt = round2(Math.max(0, state.totalDebt - a));
  save();
}

function wire(){
  // Tabs
  document.querySelectorAll(".navBtn").forEach(btn=>{
    btn.addEventListener("click", ()=>switchTab(btn.dataset.tab));
  });

  // Drawer
  $("btnMenu").addEventListener("click", ()=>openDrawer(true));
  $("btnCloseDrawer").addEventListener("click", ()=>openDrawer(false));
  $("drawerBackdrop").addEventListener("click", ()=>openDrawer(false));

  // Today
  $("btnCheckBuy").addEventListener("click", checkPurchase);
  $("btnApplyBuy").addEventListener("click", applyPurchase);

  // New check
  $("btnRunCheck").addEventListener("click", paydayPlan);
  $("btnAddBill").addEventListener("click", addBill);

  // Settings actions
  $("btnExport").addEventListener("click", exportCode);
  $("btnExportFile").addEventListener("click", exportFile);
  $("btnImport").addEventListener("click", importCode);
  $("btnReset").addEventListener("click", resetAll);
  $("btnSaveSettings").addEventListener("click", saveSettings);
  $("btnAddPTO").addEventListener("click", addPTO);

  // Workday checkboxes in settings
  $("exTue").addEventListener("change", ()=>{ state.excludeTue = $("exTue").checked; save(); });
  $("exWed").addEventListener("change", ()=>{ state.excludeWed = $("exWed").checked; save(); });

  // Debt tab
  document.querySelectorAll("[data-debtpay]").forEach(btn=>{
    btn.addEventListener("click", ()=>applyDebtPaid(btn.dataset.debtpay));
  });
  $("btnDebtCustom").addEventListener("click", ()=>{
    applyDebtPaid($("debtCustom").value);
    $("debtCustom").value = "";
  });

  // Keep next pay + debt in sync if user types in
  $("inNextPay").addEventListener("change", (e)=>{ state.nextPayDate = e.target.value; save(); });
  $("inDebt").addEventListener("input", (e)=>{ state.totalDebt = round2(Number(e.target.value||0)); save(); });
}

wire();
render();
