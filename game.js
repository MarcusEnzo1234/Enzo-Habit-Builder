(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function hashLite(str) {
    // Simple non-crypto hash for demo auth (NOT secure; just avoids storing raw pass)
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  // ---------- Storage ----------
  const KEYS = {
    users: "hb_users_v1",
    session: "hb_session_v1",
    data: (email) => `hb_data_v1_${email}`
  };

  function loadUsers() {
    return safeJSONParse(localStorage.getItem(KEYS.users) || "[]", []);
  }
  function saveUsers(users) {
    localStorage.setItem(KEYS.users, JSON.stringify(users));
  }
  function setSession(email) {
    localStorage.setItem(KEYS.session, email);
  }
  function getSession() {
    return localStorage.getItem(KEYS.session) || "";
  }
  function clearSession() {
    localStorage.removeItem(KEYS.session);
  }

  function defaultUserData() {
    return {
      habits: [
        // starter examples (user can delete)
        { id: cryptoId(), name: "Drink Water", history: {} },
        { id: cryptoId(), name: "Study 20 min", history: {} }
      ],
      // calendar marks: { "YYYY-MM-DD": true }
      calendar: {},
      createdAt: Date.now()
    };
  }

  function loadUserData(email) {
    const raw = localStorage.getItem(KEYS.data(email));
    if (!raw) return defaultUserData();
    const data = safeJSONParse(raw, defaultUserData());
    // ensure required fields exist
    data.habits ||= [];
    data.calendar ||= {};
    return data;
  }
  function saveUserData(email, data) {
    localStorage.setItem(KEYS.data(email), JSON.stringify(data));
  }

  function cryptoId() {
    // Avoid errors if crypto not available (older browsers)
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      return `${a[0].toString(16)}${a[1].toString(16)}`;
    }
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  // ---------- Quotes ----------
  const QUOTES = [
    { t: "Small steps every day become big results.", b: "Habit Builder" },
    { t: "You don’t need motivation. You need a system.", b: "James Clear (idea)" },
    { t: "Consistency beats intensity.", b: "Daily rule" },
    { t: "Show up. Even if it’s messy.", b: "Keep going" },
    { t: "Your future self is watching.", b: "Reminder" },
    { t: "One check-in today = a stronger tomorrow.", b: "Habit Builder" },
    { t: "Make it easy. Make it obvious. Make it done.", b: "Good systems" },
    { t: "Streaks are built on ordinary days.", b: "Habit Builder" }
  ];

  function pickQuote() {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    $("#quoteText").textContent = `“${q.t}”`;
    $("#quoteBy").textContent = `— ${q.b}`;
  }

  // ---------- UI Elements ----------
  const screenAuth = $("#screenAuth");
  const screenApp = $("#screenApp");
  const btnLogout = $("#btnLogout");

  const authMsg = $("#authMsg");

  const helloName = $("#helloName");
  const todayLabel = $("#todayLabel");

  const habitList = $("#habitList");
  const totalStreakEl = $("#totalStreak");
  const habitCountEl = $("#habitCount");
  const checkedTodayEl = $("#checkedToday");

  const formAddHabit = $("#formAddHabit");
  const habitNameInput = $("#habitName");
  const btnCheckAll = $("#btnCheckAll");

  const calGrid = $("#calGrid");
  const calMonthLabel = $("#calMonth");
  const calPrev = $("#calPrev");
  const calNext = $("#calNext");

  const btnNewQuote = $("#btnNewQuote");

  // ---------- App State ----------
  let currentEmail = "";
  let currentUser = null; // {name,email}
  let data = null;        // user data
  let calCursor = new Date(); // calendar month cursor

  // ---------- Auth Tabs ----------
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const id = tab.dataset.tab;
      $$(".form").forEach((p) => p.classList.toggle("active", p.dataset.panel === id));
      setAuthMsg("");
    });
  });

  function setAuthMsg(text, type = "") {
    authMsg.className = "msg" + (type ? ` ${type}` : "");
    authMsg.textContent = text;
  }

  // ---------- Auth Logic ----------
  $("#formRegister").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#regName").value.trim();
    const email = $("#regEmail").value.trim().toLowerCase();
    const pass = $("#regPass").value;

    if (!name || !email || !pass) return;

    const users = loadUsers();
    if (users.some((u) => u.email === email)) {
      setAuthMsg("That email is already registered. Try logging in.", "bad");
      return;
    }

    users.push({ name, email, passHash: hashLite(pass) });
    saveUsers(users);

    // init user data
    saveUserData(email, defaultUserData());

    setSession(email);
    boot();
  });

  $("#formLogin").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#loginEmail").value.trim().toLowerCase();
    const pass = $("#loginPass").value;

    const users = loadUsers();
    const found = users.find((u) => u.email === email);
    if (!found) {
      setAuthMsg("Account not found. Register first.", "bad");
      return;
    }
    if (found.passHash !== hashLite(pass)) {
      setAuthMsg("Wrong password. Try again.", "bad");
      return;
    }

    setSession(email);
    boot();
  });

  $("#formForgot").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#forgotEmail").value.trim().toLowerCase();
    const newPass = $("#forgotNewPass").value;

    const users = loadUsers();
    const idx = users.findIndex((u) => u.email === email);
    if (idx === -1) {
      setAuthMsg("If that account exists, it can be reset here. (No match found.)", "bad");
      return;
    }

    users[idx].passHash = hashLite(newPass);
    saveUsers(users);
    setAuthMsg("Password reset! You can now log in.", "ok");
    // switch to login tab
    document.querySelector('.tab[data-tab="login"]').click();
    $("#loginEmail").value = email;
    $("#loginPass").value = "";
  });

  btnLogout.addEventListener("click", () => {
    clearSession();
    currentEmail = "";
    currentUser = null;
    data = null;
    showAuth();
  });

  // ---------- Habit Logic ----------
  formAddHabit.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = habitNameInput.value.trim();
    if (!name) return;

    data.habits.push({ id: cryptoId(), name, history: {} });
    habitNameInput.value = "";
    persistAndRender();
  });

  btnCheckAll.addEventListener("click", () => {
    const iso = todayISO();
    let any = false;

    data.habits.forEach((h) => {
      if (!h.history[iso]) {
        h.history[iso] = true;
        any = true;
      }
    });

    if (any) {
      data.calendar[iso] = true;
      persistAndRender();
    } else {
      // already checked all
      render(); // no change, but safe
    }
  });

  function toggleCheckIn(habitId) {
    const iso = todayISO();
    const h = data.habits.find((x) => x.id === habitId);
    if (!h) return;

    const prev = !!h.history[iso];
    if (prev) delete h.history[iso];
    else h.history[iso] = true;

    // calendar mark: at least one habit checked today
    const anyCheckedToday = data.habits.some((hb) => !!hb.history[iso]);
    if (anyCheckedToday) data.calendar[iso] = true;
    else delete data.calendar[iso];

    persistAndRender();
  }

  function removeHabit(habitId) {
    data.habits = data.habits.filter((h) => h.id !== habitId);

    // update calendar for today in case it was only that habit
    const iso = todayISO();
    const anyCheckedToday = data.habits.some((hb) => !!hb.history[iso]);
    if (anyCheckedToday) data.calendar[iso] = true;
    else delete data.calendar[iso];

    persistAndRender();
  }

  function streakForHabit(h) {
    // count consecutive days ending today where history[day] is true
    let streak = 0;
    const d = new Date();
    for (;;) {
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      if (h.history[iso]) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  // ---------- Calendar ----------
  function setCalendarCursorToCurrent() {
    const d = new Date();
    calCursor = new Date(d.getFullYear(), d.getMonth(), 1);
  }

  calPrev.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  calNext.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  function renderCalendar() {
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    calMonthLabel.textContent = `${monthNames[month]} ${year}`;

    calGrid.innerHTML = "";

    // Leading blanks
    const startDay = first.getDay(); // 0..6
    const daysInMonth = last.getDate();

    // We build a 6-week grid for stable layout
    const totalCells = 42;

    // Determine what date the grid starts on (Sunday before/at first)
    const gridStart = new Date(year, month, 1 - startDay);

    const today = new Date();
    const todayIso = todayISO();
    const currentMonthKey = monthKey(calCursor);

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);

      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const inMonth = monthKey(d) === currentMonthKey;
      const checked = !!data.calendar[iso];

      const cell = document.createElement("div");
      cell.className = "dayCell" + (inMonth ? " inMonth" : "") + (checked ? " checked" : "") + (iso === todayIso ? " today" : "");
      cell.textContent = String(d.getDate());

      const mini = document.createElement("div");
      mini.className = "mini";
      mini.textContent = checked ? "✓" : "";
      cell.appendChild(mini);

      calGrid.appendChild(cell);
    }
  }

  // ---------- Render ----------
  function render() {
    const iso = todayISO();
    const users = loadUsers();
    currentUser = users.find((u) => u.email === currentEmail) || null;

    // Top UI
    btnLogout.classList.toggle("hidden", !currentEmail);

    // Labels
    const d = new Date();
    const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
    todayLabel.textContent = `${weekday}, ${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    helloName.textContent = currentUser ? `Hi, ${currentUser.name}!` : "Hi!";

    // Habits
    habitList.innerHTML = "";
    const habits = data.habits || [];

    let totalStreak = 0;
    let checkedToday = 0;

    habits.forEach((h) => {
      const isChecked = !!h.history[iso];
      if (isChecked) checkedToday++;
      const streak = streakForHabit(h);
      totalStreak += streak;

      const li = document.createElement("li");
      li.className = "habitItem";

      const top = document.createElement("div");
      top.className = "habitTop";

      const name = document.createElement("div");
      name.className = "habitName";
      name.textContent = h.name;

      const badges = document.createElement("div");
      badges.className = "badges";

      const b1 = document.createElement("span");
      b1.className = "badge " + (isChecked ? "good" : "warn");
      b1.textContent = isChecked ? "Checked Today ✓" : "Not Yet Today";
      badges.appendChild(b1);

      const b2 = document.createElement("span");
      b2.className = "badge good";
      b2.textContent = `Streak: ${streak}🔥`;
      badges.appendChild(b2);

      top.appendChild(name);
      top.appendChild(badges);

      const actions = document.createElement("div");
      actions.className = "habitActions";

      const btnCheck = document.createElement("button");
      btnCheck.type = "button";
      btnCheck.className = "btn primary";
      btnCheck.textContent = isChecked ? "Undo Today" : "Check-in Today";
      btnCheck.addEventListener("click", () => toggleCheckIn(h.id));

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn ghost btnDanger";
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", () => removeHabit(h.id));

      actions.appendChild(btnCheck);
      actions.appendChild(btnDel);

      li.appendChild(top);
      li.appendChild(actions);

      habitList.appendChild(li);
    });

    habitCountEl.textContent = String(habits.length);
    checkedTodayEl.textContent = String(checkedToday);
    totalStreakEl.textContent = String(totalStreak);

    // Calendar
    renderCalendar();
  }

  function persistAndRender() {
    saveUserData(currentEmail, data);
    render();
  }

  // ---------- Screen switching ----------
  function showAuth() {
    screenAuth.classList.remove("hidden");
    screenApp.classList.add("hidden");
    btnLogout.classList.add("hidden");
    setAuthMsg("");
  }

  function showApp() {
    screenAuth.classList.add("hidden");
    screenApp.classList.remove("hidden");
    btnLogout.classList.remove("hidden");
  }

  // ---------- Boot ----------
  function boot() {
    const email = getSession();
    if (!email) {
      showAuth();
      pickQuote();
      return;
    }

    currentEmail = email;
    data = loadUserData(currentEmail);
    setCalendarCursorToCurrent();
    showApp();
    pickQuote();
    render();
  }

  btnNewQuote.addEventListener("click", pickQuote);

  // Start
  boot();
})();
