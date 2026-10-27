"use strict";

/* =========================================================
   FEROTDAO — Complete browser-based personal ledger
   Storage: LocalStorage | No frameworks | No external APIs
   Designed and Maintained by Md. Shah Juhayer
   ========================================================= */

const APP_VERSION = "1.0.0";
const STORAGE_KEY = "ferotdao_data_v1";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const uid = () => (
  window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : "fd-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 11)
);

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

const numberValue = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const money = value => {
  const amount = numberValue(value);
  return "৳ " + new Intl.NumberFormat("bn-BD", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(amount);
};

const numberBN = value => new Intl.NumberFormat("bn-BD").format(numberValue(value));

const formatDate = value => {
  if (!value) return "তারিখ দেওয়া নেই";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "তারিখ দেওয়া নেই";
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
};

const validISODate = value => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

function emptyData() {
  return {
    version: APP_VERSION,
    friends: [],
    transactions: [],
    items: [],
    updatedAt: new Date().toISOString()
  };
}

function validDataShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.friends) ||
      !Array.isArray(data.transactions) ||
      !Array.isArray(data.items)) return false;

  const friendIds = new Set();
  for (const friend of data.friends) {
    if (!friend || typeof friend.id !== "string" ||
        typeof friend.name !== "string" || !friend.name.trim()) return false;
    if (friendIds.has(friend.id)) return false;
    friendIds.add(friend.id);
  }

  const transactionIds = new Set();
  for (const transaction of data.transactions) {
    if (!transaction || typeof transaction.id !== "string" ||
        typeof transaction.friendId !== "string" ||
        typeof transaction.friendName !== "string" ||
        !["lend", "borrow"].includes(transaction.type)) return false;

    const amount = Number(transaction.amount);
    const paid = Number(transaction.paid);
    if (!Number.isFinite(amount) || amount <= 0 ||
        !Number.isFinite(paid) || paid < 0 || paid > amount) return false;

    if (transactionIds.has(transaction.id)) return false;
    transactionIds.add(transaction.id);
  }

  const itemIds = new Set();
  for (const item of data.items) {
    if (!item || typeof item.id !== "string" ||
        typeof item.friendId !== "string" ||
        typeof item.friendName !== "string" ||
        typeof item.name !== "string" || !item.name.trim() ||
        !["given", "received"].includes(item.direction) ||
        typeof item.returned !== "boolean") return false;

    if (itemIds.has(item.id)) return false;
    itemIds.add(item.id);
  }

  return true;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();

    const parsed = JSON.parse(raw);
    if (!validDataShape(parsed)) {
      throw new Error("সংরক্ষিত ডেটার কাঠামো সঠিক নয়।");
    }

    return {
      version: APP_VERSION,
      friends: parsed.friends,
      transactions: parsed.transactions,
      items: parsed.items,
      updatedAt: parsed.updatedAt || new Date().toISOString()
    };
  } catch (error) {
    console.error("FerotDao storage load error:", error);
    storageLoadError = true;
    return emptyData();
  }
}

let storageLoadError = false;
let storageAvailable = true;
let state = loadData();
let currentPage = "dashboard";
let modalMode = null;
let modalRecordId = null;
let confirmAction = null;
let lastFocusedElement = null;

function saveData() {
  state.version = APP_VERSION;
  state.updatedAt = new Date().toISOString();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageAvailable = true;
    return true;
  } catch (error) {
    console.error("FerotDao storage save error:", error);
    storageAvailable = false;
    toast("ডেটা সংরক্ষণ করা যায়নি। ব্রাউজারের storage খালি করুন বা ব্যাকআপ নিন।", "error");
    renderStorageStatus();
    return false;
  }
}

function toast(message, type = "success") {
  const region = $("#toastRegion");
  const element = document.createElement("div");
  element.className = "toast" + (type === "error" ? " error" : "");
  element.textContent = message;
  region.appendChild(element);
  window.setTimeout(() => element.remove(), 4200);
}

function confirmDialog(message, action, title = "আপনি কি নিশ্চিত?") {
  confirmAction = action;
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  $("#confirmBackdrop").classList.remove("hidden");
  $("#confirmAccept").focus();
}

function closeConfirm() {
  $("#confirmBackdrop").classList.add("hidden");
  confirmAction = null;
}

function runConfirm() {
  const action = confirmAction;
  closeConfirm();
  if (typeof action === "function") action();
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebarOverlay").classList.remove("visible");
}

function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#sidebarOverlay").classList.add("visible");
}

function goToPage(page) {
  const validPages = ["dashboard", "transactions", "items", "friends", "settings"];
  if (!validPages.includes(page)) return;

  currentPage = page;

  $$(".page-content").forEach(section => section.classList.add("hidden"));
  $("#page-" + page).classList.remove("hidden");

  $$(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const titles = {
    dashboard: "ড্যাশবোর্ড",
    transactions: "টাকার হিসাব",
    items: "জিনিসপত্র",
    friends: "বন্ধুদের তালিকা",
    settings: "সেটিংস ও ব্যাকআপ"
  };

  $("#pageTitle").textContent = titles[page];
  closeSidebar();

  if (page === "settings") renderStorageStatus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function findFriend(id) {
  return state.friends.find(friend => friend.id === id);
}

function findTransaction(id) {
  return state.transactions.find(transaction => transaction.id === id);
}

function findItem(id) {
  return state.items.find(item => item.id === id);
}

function outstanding(transaction) {
  return Math.max(0, numberValue(transaction.amount) - numberValue(transaction.paid));
}

function isSettled(transaction) {
  return outstanding(transaction) <= 0.000001;
}

function upsertFriend(name, phone = "", note = "") {
  const normalizedName = String(name).trim();
  const normalizedPhone = String(phone).trim();

  let friend = state.friends.find(item =>
    item.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase() &&
    (
      !normalizedPhone ||
      !item.phone ||
      item.phone.trim() === normalizedPhone
    )
  );

  if (!friend) {
    friend = {
      id: uid(),
      name: normalizedName,
      phone: normalizedPhone,
      note: String(note).trim(),
      createdAt: new Date().toISOString()
    };
    state.friends.push(friend);
  } else {
    if (normalizedPhone && !friend.phone) friend.phone = normalizedPhone;
    if (note.trim() && !friend.note) friend.note = note.trim();
  }

  return friend;
}

function friendMoneySummary(friendId) {
  const records = state.transactions.filter(transaction => transaction.friendId === friendId);
  const receivable = records
    .filter(transaction => transaction.type === "lend")
    .reduce((sum, transaction) => sum + outstanding(transaction), 0);
  const payable = records
    .filter(transaction => transaction.type === "borrow")
    .reduce((sum, transaction) => sum + outstanding(transaction), 0);

  return {
    receivable,
    payable,
    net: receivable - payable,
    transactions: records.length,
    openItems: state.items.filter(item => item.friendId === friendId && !item.returned).length
  };
}

function overallSummary() {
  const receivable = state.transactions
    .filter(transaction => transaction.type === "lend")
    .reduce((sum, transaction) => sum + outstanding(transaction), 0);

  const payable = state.transactions
    .filter(transaction => transaction.type === "borrow")
    .reduce((sum, transaction) => sum + outstanding(transaction), 0);

  return {
    receivable,
    payable,
    net: receivable - payable,
    openItems: state.items.filter(item => !item.returned).length
  };
}

function avatarMarkup(name, large = false) {
  const initial = Array.from(String(name || "?").trim())[0] || "?";
  return `<div class="avatar${large ? " avatar-large" : ""}">${escapeHTML(initial)}</div>`;
}

function personMarkup(name, subtitle = "") {
  return `<div class="person-cell">
    ${avatarMarkup(name)}
    <div class="person-info">
      <strong>${escapeHTML(name)}</strong>
      <small>${escapeHTML(subtitle)}</small>
    </div>
  </div>`;
}

function badgeMarkup(text, type) {
  return `<span class="badge badge-${type}">${escapeHTML(text)}</span>`;
}

function emptyMarkup(title, message) {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${escapeHTML(message)}</div>`;
}

function transactionRow(transaction, showActions = true) {
  const remaining = outstanding(transaction);
  const isLend = transaction.type === "lend";
  const typeText = isLend ? "আমি দিয়েছি" : "আমি নিয়েছি";
  const status = isSettled(transaction)
    ? badgeMarkup("পরিশোধ সম্পন্ন", "paid")
    : badgeMarkup("বাকি আছে", "due");

  const actions = showActions
    ? `<div class="row-actions">
        ${!isSettled(transaction)
          ? `<button class="small-button" data-action="repay" data-id="${escapeHTML(transaction.id)}">ফেরত</button>`
          : ""}
        <button class="small-button danger" data-action="delete-transaction" data-id="${escapeHTML(transaction.id)}" aria-label="হিসাব মুছুন">মুছুন</button>
      </div>`
    : "";

  return `<tr>
    <td>${personMarkup(transaction.friendName, typeText)}</td>
    <td>${money(transaction.amount)}</td>
    <td>${money(remaining)}</td>
    <td>${escapeHTML(formatDate(transaction.date))}</td>
    <td>${status}</td>
    <td>${actions}</td>
  </tr>`;
}

function renderTransactionTable(records, targetId, limit = Infinity) {
  const target = $("#" + targetId);
  const rows = records.slice(0, limit);

  if (!rows.length) {
    target.innerHTML = emptyMarkup("এখনো কোনো টাকার হিসাব নেই", "নতুন হিসাব যোগ করলে এখানে দেখা যাবে।");
    return;
  }

  target.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>ব্যক্তি / ধরন</th><th>মোট টাকা</th><th>বাকি</th><th>তারিখ</th><th>অবস্থা</th><th>কাজ</th>
    </tr></thead>
    <tbody>${rows.map(record => transactionRow(record)).join("")}</tbody>
  </table>`;
}

function itemCard(item) {
  const isGiven = item.direction === "given";
  const directionText = isGiven ? "আমি দিয়েছি" : "আমি নিয়েছি";
  const status = item.returned
    ? badgeMarkup("ফেরত সম্পন্ন", "paid")
    : badgeMarkup("ফেরত বাকি", "due");

  return `<article class="item-card">
    <div class="item-card-top">
      <div class="item-symbol">▤</div>
      ${status}
    </div>
    <h3>${escapeHTML(item.name)}</h3>
    <p>${escapeHTML(item.friendName)} · ${escapeHTML(directionText)}</p>
    ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
    <div class="item-meta">
      <div class="item-meta-row"><span>দেওয়া/নেওয়ার তারিখ</span><span>${escapeHTML(formatDate(item.date))}</span></div>
      <div class="item-meta-row"><span>ফেরতের তারিখ</span><span>${escapeHTML(formatDate(item.dueDate))}</span></div>
      ${item.note ? `<div class="item-meta-row"><span>নোট</span><span>${escapeHTML(item.note)}</span></div>` : ""}
    </div>
    <div class="item-card-actions">
      ${!item.returned
        ? `<button class="small-button" data-action="toggle-item" data-id="${escapeHTML(item.id)}">ফেরত সম্পন্ন</button>`
        : `<button class="small-button" data-action="toggle-item" data-id="${escapeHTML(item.id)}">আবার বাকি করুন</button>`}
      <button class="small-button danger" data-action="delete-item" data-id="${escapeHTML(item.id)}">মুছুন</button>
    </div>
  </article>`;
}

function renderRecentItems() {
  const target = $("#recentItems");
  const records = state.items.filter(item => !item.returned).slice().reverse().slice(0, 5);

  if (!records.length) {
    target.innerHTML = emptyMarkup("কোনো জিনিস ফেরত বাকি নেই", "প্রয়োজনে নতুন জিনিসের রেকর্ড যোগ করুন।");
    return;
  }

  target.innerHTML = records.map(item => `
    <div class="compact-item">
      <div class="item-symbol">▤</div>
      <div class="compact-item-main">
        <strong>${escapeHTML(item.name)}</strong>
        <small>${escapeHTML(item.friendName)} · ${escapeHTML(item.direction === "given" ? "আপনি দিয়েছেন" : "আপনি নিয়েছেন")}</small>
      </div>
      <span class="compact-status" style="color:var(--orange)">বাকি</span>
    </div>`).join("");
}

function renderDashboard() {
  const summary = overallSummary();
  $("#statReceivable").textContent = money(summary.receivable);
  $("#statPayable").textContent = money(summary.payable);
  $("#statNet").textContent = (summary.net < 0 ? "− " : "") + money(Math.abs(summary.net));
  $("#statItems").textContent = numberBN(summary.openItems) + "টি";

  const transactions = state.transactions.slice().reverse();
  renderTransactionTable(transactions, "recentTransactions", 5);
  renderRecentItems();
}

function renderTransactionsPage() {
  const search = ($("#transactionSearch").value || "").trim().toLocaleLowerCase();
  const filter = $("#transactionFilter").value;

  const records = state.transactions.slice().reverse().filter(transaction => {
    const matchesSearch = [transaction.friendName, transaction.description, transaction.note]
      .some(value => String(value || "").toLocaleLowerCase().includes(search));

    const matchesFilter =
      filter === "all" ||
      (filter === "lend" && transaction.type === "lend") ||
      (filter === "borrow" && transaction.type === "borrow") ||
      (filter === "due" && !isSettled(transaction)) ||
      (filter === "settled" && isSettled(transaction));

    return matchesSearch && matchesFilter;
  });

  renderTransactionTable(records, "allTransactions");
}

function renderItemsPage() {
  const search = ($("#itemSearch").value || "").trim().toLocaleLowerCase();
  const filter = $("#itemFilter").value;

  const records = state.items.slice().reverse().filter(item => {
    const matchesSearch = [item.name, item.friendName, item.description, item.note]
      .some(value => String(value || "").toLocaleLowerCase().includes(search));

    const matchesFilter =
      filter === "all" ||
      (filter === "given" && item.direction === "given") ||
      (filter === "received" && item.direction === "received") ||
      (filter === "due" && !item.returned) ||
      (filter === "returned" && item.returned);

    return matchesSearch && matchesFilter;
  });

  $("#allItems").innerHTML = records.length
    ? records.map(itemCard).join("")
    : emptyMarkup("কোনো রেকর্ড পাওয়া যায়নি", "সার্চ বা ফিল্টার পরিবর্তন করুন, অথবা নতুন রেকর্ড যোগ করুন।");
}

function renderFriendsPage() {
  const search = ($("#friendSearch").value || "").trim().toLocaleLowerCase();
  const records = state.friends.filter(friend =>
    [friend.name, friend.phone, friend.note]
      .some(value => String(value || "").toLocaleLowerCase().includes(search))
  );

  if (!records.length) {
    $("#friendsGrid").innerHTML = emptyMarkup(
      "বন্ধুর তালিকা খালি",
      "টাকার বা জিনিসপত্রের হিসাব যোগ করলেও বন্ধু স্বয়ংক্রিয়ভাবে তালিকায় যুক্ত হবে।"
    );
    return;
  }

  $("#friendsGrid").innerHTML = records.map(friend => {
    const summary = friendMoneySummary(friend.id);
    const balanceColor = summary.net > 0 ? "var(--mint)" : summary.net < 0 ? "var(--orange)" : "var(--muted)";
    const netLabel = summary.net > 0 ? "আপনি পাবেন" : summary.net < 0 ? "আপনার দিতে হবে" : "টাকার হিসাব সমান";

    return `<article class="friend-card">
      <div class="friend-card-head">
        ${avatarMarkup(friend.name, true)}
        <div>
          <h3>${escapeHTML(friend.name)}</h3>
          <p>${escapeHTML(friend.phone || "ফোন নম্বর দেওয়া নেই")}</p>
        </div>
      </div>
      ${friend.note ? `<p>${escapeHTML(friend.note)}</p>` : ""}
      <div class="friend-balances">
        <div class="balance-box"><small>আপনি পাবেন</small><strong class="money-positive">${money(summary.receivable)}</strong></div>
        <div class="balance-box"><small>আপনার দিতে হবে</small><strong class="money-negative">${money(summary.payable)}</strong></div>
      </div>
      <div class="item-meta">
        <div class="item-meta-row"><span>নিট অবস্থান</span><span style="color:${balanceColor};font-weight:800">${escapeHTML(netLabel)}${summary.net === 0 ? "" : " · " + money(Math.abs(summary.net))}</span></div>
        <div class="item-meta-row"><span>টাকার রেকর্ড</span><span>${numberBN(summary.transactions)}টি</span></div>
        <div class="item-meta-row"><span>ফেরত বাকি জিনিস</span><span>${numberBN(summary.openItems)}টি</span></div>
      </div>
      <div class="friend-actions" style="margin-top:14px">
        <button class="small-button" data-action="friend-lend" data-id="${escapeHTML(friend.id)}">টাকা দিয়েছি</button>
        <button class="small-button" data-action="friend-borrow" data-id="${escapeHTML(friend.id)}">টাকা নিয়েছি</button>
        <button class="small-button danger" data-action="delete-friend" data-id="${escapeHTML(friend.id)}">মুছুন</button>
      </div>
    </article>`;
  }).join("");
}

function renderStorageStatus() {
  const target = $("#storageStatus");
  let bytes = 0;
  let recordCount = state.friends.length + state.transactions.length + state.items.length;

  try {
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    bytes = new Blob([raw]).size;
  } catch (_) {
    target.textContent = "ব্রাউজারের storage পরীক্ষা করা যায়নি।";
    return;
  }

  const kb = (bytes / 1024).toFixed(2);
  const statusText = storageAvailable
    ? "ব্রাউজারে ডেটা সংরক্ষণের চেষ্টা সফল হয়েছে।"
    : "সর্বশেষ সংরক্ষণ ব্যর্থ হয়েছে। ব্যাকআপ নিন এবং storage পরীক্ষা করুন।";

  target.textContent =
    `${statusText} মোট রেকর্ড: ${numberBN(recordCount)}টি। আনুমানিক ডেটার আকার: ${numberBN(kb)} KB.` +
    (storageLoadError ? " আগের সংরক্ষিত ডেটা পড়তে সমস্যা হয়েছিল; নতুন রেকর্ড যোগ করার আগে ব্যাকআপ ফাইল পরীক্ষা করুন।" : "");
}

function renderAll() {
  renderDashboard();
  renderTransactionsPage();
  renderItemsPage();
  renderFriendsPage();
  renderStorageStatus();
}

function openModal(mode, recordId = null) {
  modalMode = mode;
  modalRecordId = recordId;
  lastFocusedElement = document.activeElement;

  const titles = {
    lend: ["টাকা দিয়েছি", "যে টাকা আপনি অন্য কাউকে দিয়েছেন তার হিসাব যোগ করুন।"],
    borrow: ["টাকা নিয়েছি", "যে টাকা আপনি অন্য কারও কাছ থেকে নিয়েছেন তার হিসাব যোগ করুন।"],
    item: ["জিনিসের হিসাব", "ধার দেওয়া বা নেওয়া জিনিসের তথ্য যোগ করুন।"],
    friend: ["নতুন বন্ধু", "বন্ধুর নাম ও যোগাযোগের তথ্য লিখুন।"],
    repay: ["টাকা ফেরত", "ফেরত পাওয়া বা ফেরত দেওয়া টাকার পরিমাণ লিখুন।"]
  };

  $("#modalTitle").textContent = titles[mode][0];
  $("#modalDescription").textContent = titles[mode][1];
  $("#recordForm").reset();
  $("#modalBody").innerHTML = buildForm(mode, recordId);
  $("#modalBackdrop").classList.remove("hidden");

  const firstInput = $("#modalBody input, #modalBody select, #modalBody textarea");
  if (firstInput) firstInput.focus();
}

function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
  $("#recordForm").reset();
  modalMode = null;
  modalRecordId = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function field(label, name, options = {}) {
  const type = options.type || "text";
  const required = options.required ? " required" : "";
  const full = options.full ? " full" : "";
  const placeholder = options.placeholder ? ` placeholder="${escapeHTML(options.placeholder)}"` : "";
  const min = options.min !== undefined ? ` min="${escapeHTML(options.min)}"` : "";
  const max = options.max !== undefined ? ` max="${escapeHTML(options.max)}"` : "";
  const step = options.step !== undefined ? ` step="${escapeHTML(options.step)}"` : "";
  const value = options.value !== undefined ? ` value="${escapeHTML(options.value)}"` : "";
  const hint = options.hint ? `<small class="form-hint">${escapeHTML(options.hint)}</small>` : "";

  if (type === "textarea") {
    return `<div class="form-field${full}">
      <label for="${name}">${escapeHTML(label)}${options.required ? ' <span class="required">*</span>' : ""}</label>
      <textarea id="${name}" name="${name}"${required}${placeholder}>${escapeHTML(options.value || "")}</textarea>${hint}
    </div>`;
  }

  if (type === "select") {
    const choices = options.choices || [];
    return `<div class="form-field${full}">
      <label for="${name}">${escapeHTML(label)}${options.required ? ' <span class="required">*</span>' : ""}</label>
      <select id="${name}" name="${name}"${required}>
        ${choices.map(choice => `<option value="${escapeHTML(choice.value)}"${String(options.value) === String(choice.value) ? " selected" : ""}>${escapeHTML(choice.label)}</option>`).join("")}
      </select>${hint}
    </div>`;
  }

  return `<div class="form-field${full}">
    <label for="${name}">${escapeHTML(label)}${options.required ? ' <span class="required">*</span>' : ""}</label>
    <input id="${name}" name="${name}" type="${type}"${required}${placeholder}${min}${max}${step}${value}>${hint}
  </div>`;
}

function buildForm(mode, recordId) {
  if (mode === "friend") {
    return `<div class="form-grid">
      ${field("বন্ধুর নাম", "friendName", { required: true, placeholder: "যেমন: রহিম" , full: true })}
      ${field("ফোন নম্বর (ঐচ্ছিক)", "friendPhone", { placeholder: "01XXXXXXXXX" })}
      ${field("নোট (ঐচ্ছিক)", "friendNote", { placeholder: "বন্ধু সম্পর্কে নোট" })}
    </div>`;
  }

  if (mode === "lend" || mode === "borrow") {
    const friend = recordId ? findFriend(recordId) : null;
    return `<div class="form-grid">
      ${field("ব্যক্তির নাম", "friendName", { required: true, value: friend ? friend.name : "", placeholder: "যার সঙ্গে হিসাব" , full: true })}
      ${field("ফোন নম্বর (ঐচ্ছিক)", "friendPhone", { value: friend ? friend.phone || "" : "", placeholder: "01XXXXXXXXX" })}
      ${field("টাকার পরিমাণ (৳)", "amount", { type: "number", required: true, min: "0.01", step: "0.01", placeholder: "যেমন: 500" })}
      ${field("লেনদেনের তারিখ", "date", { type: "date", required: true, value: todayISO() })}
      ${field("ফেরতের তারিখ (ঐচ্ছিক)", "dueDate", { type: "date", min: "1900-01-01" })}
      ${field("বিবরণ (ঐচ্ছিক)", "description", { placeholder: "যেমন: বই কেনার জন্য", full: true })}
      ${field("অতিরিক্ত নোট (ঐচ্ছিক)", "note", { type: "textarea", placeholder: "প্রয়োজনীয় তথ্য", full: true })}
    </div>`;
  }

  if (mode === "item") {
    return `<div class="form-grid">
      ${field("ব্যক্তির নাম", "friendName", { required: true, placeholder: "যার সঙ্গে জিনিসের হিসাব", full: true })}
      ${field("ফোন নম্বর (ঐচ্ছিক)", "friendPhone", { placeholder: "01XXXXXXXXX" })}
      ${field("জিনিসের নাম", "itemName", { required: true, placeholder: "যেমন: ক্যালকুলেটর" })}
      ${field("হিসাবের ধরন", "direction", { type: "select", required: true, value: "given", choices: [
        { value: "given", label: "আমি জিনিস দিয়েছি" },
        { value: "received", label: "আমি জিনিস নিয়েছি" }
      ]})}
      ${field("দেওয়া/নেওয়ার তারিখ", "date", { type: "date", required: true, value: todayISO() })}
      ${field("ফেরতের তারিখ (ঐচ্ছিক)", "dueDate", { type: "date" })}
      ${field("বিবরণ (ঐচ্ছিক)", "description", { placeholder: "জিনিসের অবস্থা বা পরিচয়", full: true })}
      ${field("অতিরিক্ত নোট (ঐচ্ছিক)", "note", { type: "textarea", placeholder: "প্রয়োজনীয় তথ্য", full: true })}
    </div>`;
  }

  if (mode === "repay") {
    const transaction = findTransaction(recordId);
    if (!transaction) return `<div class="form-error">এই হিসাবটি পাওয়া যায়নি। উইন্ডো বন্ধ করে আবার চেষ্টা করুন।</div>`;

    const remaining = outstanding(transaction);
    return `<div class="form-grid">
      <div class="form-field full">
        <label>ব্যক্তি ও হিসাব</label>
        <div class="balance-box">
          <strong>${escapeHTML(transaction.friendName)}</strong>
          <small>${transaction.type === "lend" ? "আপনার পাওনা" : "আপনার দেনা"} · মোট ${money(transaction.amount)}</small>
          <small>বর্তমান বাকি: ${money(remaining)}</small>
        </div>
      </div>
      ${field("ফেরত টাকার পরিমাণ (৳)", "repayAmount", { type: "number", required: true, min: "0.01", max: remaining, step: "0.01", placeholder: "সর্বোচ্চ " + remaining })}
      ${field("ফেরতের তারিখ", "repayDate", { type: "date", required: true, value: todayISO() })}
      ${field("নোট (ঐচ্ছিক)", "repayNote", { type: "textarea", placeholder: "ফেরতের বিবরণ", full: true })}
    </div>`;
  }

  return "";
}

function formValues() {
  return Object.fromEntries(new FormData($("#recordForm")).entries());
}

function validAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1000000000000;
}

function handleFormSubmit(event) {
  event.preventDefault();
  const values = formValues();

  if (!$("#recordForm").reportValidity()) return;

  if (modalMode === "friend") {
    const name = String(values.friendName || "").trim();
    if (!name) return toast("বন্ধুর নাম লিখুন।", "error");

    const duplicate = state.friends.some(friend =>
      friend.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase() &&
      String(friend.phone || "") === String(values.friendPhone || "").trim()
    );

    if (duplicate) return toast("এই নাম ও ফোন নম্বরের বন্ধু তালিকায় আছে।", "error");

    state.friends.push({
      id: uid(),
      name,
      phone: String(values.friendPhone || "").trim(),
      note: String(values.friendNote || "").trim(),
      createdAt: new Date().toISOString()
    });

    if (!saveData()) return;
    closeModal();
    renderAll();
    toast("বন্ধুর তথ্য সংরক্ষণ হয়েছে।");
    return;
  }

  if (modalMode === "lend" || modalMode === "borrow") {
    const name = String(values.friendName || "").trim();
    if (!name) return toast("ব্যক্তির নাম লিখুন।", "error");
    if (!validAmount(values.amount)) return toast("সঠিক টাকার পরিমাণ লিখুন।", "error");
    if (!validISODate(values.date)) return toast("সঠিক লেনদেনের তারিখ নির্বাচন করুন।", "error");
    if (values.dueDate && !validISODate(values.dueDate)) return toast("ফেরতের তারিখ সঠিক নয়।", "error");

    const friend = upsertFriend(name, values.friendPhone || "");
    state.transactions.push({
      id: uid(),
      friendId: friend.id,
      friendName: friend.name,
      type: modalMode,
      amount: Number(values.amount),
      paid: 0,
      date: values.date,
      dueDate: values.dueDate || "",
      description: String(values.description || "").trim(),
      note: String(values.note || "").trim(),
      createdAt: new Date().toISOString(),
      repayments: []
    });

    if (!saveData()) return;
    closeModal();
    renderAll();
    toast(modalMode === "lend" ? "টাকা দেওয়ার হিসাব যোগ হয়েছে।" : "টাকা নেওয়ার হিসাব যোগ হয়েছে।");
    return;
  }

  if (modalMode === "item") {
    const name = String(values.friendName || "").trim();
    const itemName = String(values.itemName || "").trim();

    if (!name || !itemName) return toast("ব্যক্তির নাম ও জিনিসের নাম লিখুন।", "error");
    if (!["given", "received"].includes(values.direction)) return toast("জিনিসের হিসাবের ধরন নির্বাচন করুন।", "error");
    if (!validISODate(values.date)) return toast("সঠিক তারিখ নির্বাচন করুন।", "error");
    if (values.dueDate && !validISODate(values.dueDate)) return toast("ফেরতের তারিখ সঠিক নয়।", "error");

    const friend = upsertFriend(name, values.friendPhone || "");
    state.items.push({
      id: uid(),
      friendId: friend.id,
      friendName: friend.name,
      name: itemName,
      direction: values.direction,
      description: String(values.description || "").trim(),
      date: values.date,
      dueDate: values.dueDate || "",
      returned: false,
      note: String(values.note || "").trim(),
      createdAt: new Date().toISOString(),
      returnedAt: ""
    });

    if (!saveData()) return;
    closeModal();
    renderAll();
    toast("জিনিসের হিসাব সংরক্ষণ হয়েছে।");
    return;
  }

  if (modalMode === "repay") {
    const transaction = findTransaction(modalRecordId);
    if (!transaction) return toast("হিসাবটি পাওয়া যায়নি।", "error");

    const amount = Number(values.repayAmount);
    const remaining = outstanding(transaction);

    if (!validAmount(amount) || amount > remaining + 0.000001) {
      return toast("ফেরতের পরিমাণ বর্তমান বাকি টাকার বেশি হতে পারবে না।", "error");
    }
    if (!validISODate(values.repayDate)) return toast("সঠিক ফেরতের তারিখ নির্বাচন করুন।", "error");

    transaction.paid = Math.min(transaction.amount, transaction.paid + amount);
    if (!Array.isArray(transaction.repayments)) transaction.repayments = [];
    transaction.repayments.push({
      id: uid(),
      amount,
      date: values.repayDate,
      note: String(values.repayNote || "").trim(),
      createdAt: new Date().toISOString()
    });

    if (!saveData()) return;
    closeModal();
    renderAll();
    toast(isSettled(transaction) ? "হিসাব সম্পূর্ণ পরিশোধ হয়েছে।" : "আংশিক ফেরতের হিসাব সংরক্ষণ হয়েছে।");
  }
}

function deleteTransaction(id) {
  const transaction = findTransaction(id);
  if (!transaction) return;

  confirmDialog(
    `${transaction.friendName}-এর ${money(transaction.amount)} টাকার রেকর্ড মুছে যাবে। এই রেকর্ডের ফেরত-সংক্রান্ত তথ্যও মুছে যাবে।`,
    () => {
      state.transactions = state.transactions.filter(item => item.id !== id);
      if (!saveData()) return;
      renderAll();
      toast("টাকার হিসাব মুছে ফেলা হয়েছে।");
    },
    "টাকার হিসাব মুছবেন?"
  );
}

function deleteItem(id) {
  const item = findItem(id);
  if (!item) return;

  confirmDialog(
    `"${item.name}"-এর রেকর্ড মুছে যাবে। এই কাজটি ফিরিয়ে আনা যাবে না।`,
    () => {
      state.items = state.items.filter(record => record.id !== id);
      if (!saveData()) return;
      renderAll();
      toast("জিনিসের রেকর্ড মুছে ফেলা হয়েছে।");
    },
    "জিনিসের হিসাব মুছবেন?"
  );
}

function toggleItem(id) {
  const item = findItem(id);
  if (!item) return;

  const nextState = !item.returned;
  confirmDialog(
    nextState
      ? `"${item.name}"-কে ফেরত সম্পন্ন হিসেবে চিহ্নিত করবেন?`
      : `"${item.name}"-এর ফেরত সম্পন্ন অবস্থা বাতিল করে আবার বাকি হিসেবে চিহ্নিত করবেন?`,
    () => {
      item.returned = nextState;
      item.returnedAt = nextState ? todayISO() : "";
      if (!saveData()) return;
      renderAll();
      toast(nextState ? "জিনিস ফেরত সম্পন্ন হয়েছে।" : "জিনিস আবার ফেরত বাকি হিসেবে চিহ্নিত হয়েছে।");
    },
    "জিনিসের অবস্থা পরিবর্তন"
  );
}

function deleteFriend(id) {
  const friend = findFriend(id);
  if (!friend) return;

  const hasTransactions = state.transactions.some(item => item.friendId === id);
  const hasItems = state.items.some(item => item.friendId === id);

  if (hasTransactions || hasItems) {
    return toast("এই বন্ধুর সঙ্গে রেকর্ড রয়েছে। আগে সংশ্লিষ্ট হিসাব মুছুন; তারপর বন্ধুকে মুছতে পারবেন।", "error");
  }

  confirmDialog(
    `${friend.name}-কে বন্ধুদের তালিকা থেকে মুছে ফেলবেন?`,
    () => {
      state.friends = state.friends.filter(item => item.id !== id);
      if (!saveData()) return;
      renderAll();
      toast("বন্ধুর তথ্য মুছে ফেলা হয়েছে।");
    },
    "বন্ধুকে মুছবেন?"
  );
}

function exportBackup() {
  const backup = {
    app: "FerotDao",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ferotdao-backup-" + todayISO() + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("ব্যাকআপ ডাউনলোড শুরু হয়েছে।");
}

function normalizeImportedData(candidate) {
  if (candidate && candidate.app === "FerotDao" && candidate.data) {
    candidate = candidate.data;
  }

  if (!validDataShape(candidate)) {
    throw new Error("ফাইলটি সঠিক FerotDao ব্যাকআপ নয় অথবা ডেটা অসম্পূর্ণ।");
  }

  // Validate that every referenced friend exists.
  const ids = new Set(candidate.friends.map(friend => friend.id));
  for (const record of [...candidate.transactions, ...candidate.items]) {
    if (!ids.has(record.friendId)) {
      throw new Error("ব্যাকআপে এমন রেকর্ড আছে যার সংশ্লিষ্ট বন্ধু পাওয়া যায়নি।");
    }
  }

  // Normalize older valid records without changing the record IDs.
  return {
    version: APP_VERSION,
    friends: candidate.friends.map(friend => ({
      id: friend.id,
      name: friend.name.trim(),
      phone: String(friend.phone || ""),
      note: String(friend.note || ""),
      createdAt: friend.createdAt || ""
    })),
    transactions: candidate.transactions.map(record => ({
      id: record.id,
      friendId: record.friendId,
      friendName: record.friendName,
      type: record.type,
      amount: Number(record.amount),
      paid: Number(record.paid),
      date: validISODate(record.date) ? record.date : todayISO(),
      dueDate: validISODate(record.dueDate) ? record.dueDate : "",
      description: String(record.description || ""),
      note: String(record.note || ""),
      createdAt: record.createdAt || "",
      repayments: Array.isArray(record.repayments) ? record.repayments : []
    })),
    items: candidate.items.map(item => ({
      id: item.id,
      friendId: item.friendId,
      friendName: item.friendName,
      name: item.name,
      direction: item.direction,
      description: String(item.description || ""),
      date: validISODate(item.date) ? item.date : todayISO(),
      dueDate: validISODate(item.dueDate) ? item.dueDate : "",
      returned: item.returned,
      note: String(item.note || ""),
      createdAt: item.createdAt || "",
      returnedAt: item.returnedAt || ""
    })),
    updatedAt: new Date().toISOString()
  };
}

async function importBackup(file) {
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    $("#importFile").value = "";
    return toast("ব্যাকআপ ফাইলের আকার ১০ MB-এর বেশি।", "error");
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = normalizeImportedData(parsed);

    $("#importFile").value = "";

    confirmDialog(
      "বর্তমান সব ডেটা প্রতিস্থাপিত হবে। বর্তমান ডেটা রাখতে চাইলে আগে ব্যাকআপ ডাউনলোড করুন।",
      () => {
        const oldState = state;
        state = imported;

        if (!saveData()) {
          state = oldState;
          return;
        }

        renderAll();
        toast("ব্যাকআপ থেকে ডেটা পুনরুদ্ধার হয়েছে।");
      },
      "ব্যাকআপ পুনরুদ্ধার করবেন?"
    );
  } catch (error) {
    $("#importFile").value = "";
    console.error("Backup import error:", error);
    toast(error.message || "ব্যাকআপ ফাইল পড়া যায়নি।", "error");
  }
}

function clearAllData() {
  confirmDialog(
    "বন্ধু, টাকার হিসাব ও জিনিসপত্রের সব ডেটা স্থায়ীভাবে মুছে যাবে। এই কাজ ফিরিয়ে আনা যাবে না। আগে ব্যাকআপ ডাউনলোড করে নিন।",
    () => {
      const previous = state;
      state = emptyData();

      if (!saveData()) {
        state = previous;
        return;
      }

      renderAll();
      goToPage("dashboard");
      toast("সব ডেটা মুছে ফেলা হয়েছে।");
    },
    "সব ডেটা স্থায়ীভাবে মুছবেন?"
  );
}

function handleAction(action, id) {
  switch (action) {
    case "lend":
    case "borrow":
    case "item":
    case "friend":
      openModal(action);
      break;

    case "repay":
      openModal("repay", id);
      break;

    case "delete-transaction":
      deleteTransaction(id);
      break;

    case "delete-item":
      deleteItem(id);
      break;

    case "toggle-item":
      toggleItem(id);
      break;

    case "delete-friend":
      deleteFriend(id);
      break;

    case "friend-lend":
      openModal("lend", id);
      break;

    case "friend-borrow":
      openModal("borrow", id);
      break;
  }
}

function handleDocumentClick(event) {
  const nav = event.target.closest("[data-page]");
  if (nav) {
    goToPage(nav.dataset.page);
    return;
  }

  const goto = event.target.closest("[data-goto]");
  if (goto) {
    goToPage(goto.dataset.goto);
    return;
  }

  const quick = event.target.closest("[data-action]");
  if (quick) {
    handleAction(quick.dataset.action, quick.dataset.id || null);
  }
}

function setupDateLabels() {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("bn-BD", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(now);

  $("#todayLabel").textContent = formatted;
  $("#year").textContent = now.getFullYear();
  $("#footerYear").textContent = now.getFullYear();
}

function init() {
  setupDateLabels();

  $("#menuToggle").addEventListener("click", openSidebar);
  $("#closeSidebar").addEventListener("click", closeSidebar);
  $("#sidebarOverlay").addEventListener("click", closeSidebar);

  $("#topAddButton").addEventListener("click", () => openModal("lend"));
  $("#addFriendButton").addEventListener("click", () => openModal("friend"));

  $("#closeModal").addEventListener("click", closeModal);
  $("#cancelModal").addEventListener("click", closeModal);
  $("#recordForm").addEventListener("submit", handleFormSubmit);

  $("#modalBackdrop").addEventListener("click", event => {
    if (event.target === $("#modalBackdrop")) closeModal();
  });

  $("#confirmCancel").addEventListener("click", closeConfirm);
  $("#confirmAccept").addEventListener("click", runConfirm);
  $("#confirmBackdrop").addEventListener("click", event => {
    if (event.target === $("#confirmBackdrop")) closeConfirm();
  });

  $("#transactionSearch").addEventListener("input", renderTransactionsPage);
  $("#transactionFilter").addEventListener("change", renderTransactionsPage);
  $("#itemSearch").addEventListener("input", renderItemsPage);
  $("#itemFilter").addEventListener("change", renderItemsPage);
  $("#friendSearch").addEventListener("input", renderFriendsPage);

  $("#exportButton").addEventListener("click", exportBackup);
  $("#importFile").addEventListener("change", event => {
    const file = event.target.files && event.target.files[0];
    if (file) importBackup(file);
  });

  $("#clearDataButton").addEventListener("click", clearAllData);
  $("#refreshStatusButton").addEventListener("click", () => {
    renderStorageStatus();
    toast("সংরক্ষণের অবস্থা আপডেট করা হয়েছে।");
  });

  document.addEventListener("click", handleDocumentClick);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (!$("#confirmBackdrop").classList.contains("hidden")) closeConfirm();
      else if (!$("#modalBackdrop").classList.contains("hidden")) closeModal();
      else closeSidebar();
    }
  });

  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY) return;
    toast("অন্য ট্যাব থেকে ডেটা পরিবর্তিত হয়েছে। নতুন ডেটা দেখতে পেজ রিফ্রেশ করুন।");
  });

  renderAll();

  if (storageLoadError) {
    toast("আগের সংরক্ষিত ডেটা পড়তে সমস্যা হয়েছে। নতুন তথ্য যোগ করার আগে ব্যাকআপ পরীক্ষা করুন।", "error");
  }

  if (!storageAvailable) {
    toast("এই ব্রাউজারে ডেটা সংরক্ষণে সমস্যা হতে পারে।", "error");
  }
}

document.addEventListener("DOMContentLoaded", init);
