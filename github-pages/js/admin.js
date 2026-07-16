import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { getSettingString, setSettingString, settingCodes } from "./settings.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginForm = document.querySelector("#loginForm");
const adminEmailInput = document.querySelector("#adminEmail");
const adminPasswordInput = document.querySelector("#adminPassword");
const loginStatus = document.querySelector("#loginStatus");
const adminEditor = document.querySelector("#adminEditor");
const practiceEditorList = document.querySelector("#practiceEditorList");
const practiceDateEditorList = document.querySelector("#practiceDateEditorList");
const contactFInput = document.querySelector("#contactFInput");
const contactEmailInput = document.querySelector("#contactEmailInput");
const adminStatus = document.querySelector("#adminStatus");
const adminUser = document.querySelector("#adminUser");
const addPracticeButton = document.querySelector("#addPractice");
const addPracticeDateButton = document.querySelector("#addPracticeDate");
const runMonthlyProcessButton = document.querySelector("#runMonthlyProcess");
const saveAllButton = document.querySelector("#saveAll");
const logoutButton = document.querySelector("#logoutButton");

let practices = [];
let practiceDates = [];
let currentUser = null;
let pendingFocus = null;
const cleanupBatchSize = 100;
const defaultContactEmail = "himawari.club.yawata@gmail.com";

const escapeHtml = (value) => {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
};

const setLoginStatus = (message, isError = false) => {
  loginStatus.textContent = message;
  loginStatus.classList.toggle("is-error", isError);
};

const setAdminStatus = (message, isError = false) => {
  adminStatus.textContent = message;
  adminStatus.classList.toggle("is-error", isError);
};

const createId = () => {
  return crypto.randomUUID();
};

const fetchPractices = async () => {
  const snapshot = await getDocs(collection(db, "practices"));
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .sort((a, b) => `${a.day}${a.time}${a.name}`.localeCompare(`${b.day}${b.time}${b.name}`, "ja"));
};

const fetchPracticeDates = async () => {
  const snapshot = await getDocs(collection(db, "practiceDate"));
  const practiceOrder = new Map(practices.map((practice, index) => [practice.id, index]));
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .sort((a, b) => {
      const orderA = practiceOrder.get(a.practiceId) ?? Number.MAX_SAFE_INTEGER;
      const orderB = practiceOrder.get(b.practiceId) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      const dateA = `${a.year}${String(a.month).padStart(2, "0")}`;
      const dateB = `${b.year}${String(b.month).padStart(2, "0")}`;
      return dateB.localeCompare(dateA);
    });
};

const isEnabledSetting = (value) => {
  return ["true", "1", "on"].includes(String(value).trim().toLowerCase());
};

const isEmailAddress = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const loadContactSettings = async () => {
  const [contactF, contactEmail] = await Promise.all([
    getSettingString(db, settingCodes.contactF, "True"),
    getSettingString(db, settingCodes.contactEmail, defaultContactEmail)
  ]);

  contactFInput.checked = isEnabledSetting(contactF);
  contactEmailInput.value = contactEmail.trim();
};

const saveContactSettings = async () => {
  await Promise.all([
    setSettingString(db, settingCodes.contactF, contactFInput.checked ? "True" : "False"),
    setSettingString(db, settingCodes.contactEmail, contactEmailInput.value.trim())
  ]);
};

const readCookie = (key) => {
  return document.cookie.split(";").map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${key}=`))?.split("=")[1] ?? "";
};

const writeCookie = (key, value) => {
  document.cookie = `${key}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
};

const deleteCookie = (key) => {
  document.cookie = `${key}=; max-age=0; path=/; SameSite=Lax`;
};

const savePractices = async () => {
  practices = practices.map((practice) => ({
    ...practice,
    id: practice.id || createId()
  }));

  const currentSnapshot = await getDocs(collection(db, "practices"));
  const batch = writeBatch(db);
  const nextIds = new Set(practices.map((practice) => practice.id));

  currentSnapshot.docs.forEach((document) => {
    if (!nextIds.has(document.id)) {
      batch.delete(document.ref);
    }
  });

  practices.forEach((practice) => {
    const reference = doc(db, "practices", practice.id);
    batch.set(reference, {
      day: practice.day.trim(),
      description: practice.description.trim(),
      dispF: Boolean(practice.dispF),
      name: practice.name.trim(),
      time: practice.time.trim(),
      updateAt: serverTimestamp(),
      updateUserId: currentUser.uid
    });
  });

  await batch.commit();
};

const savePracticeDates = async () => {
  practiceDates = practiceDates.map((practiceDate) => ({
    ...practiceDate,
    id: practiceDate.id || createId()
  }));

  const currentSnapshot = await getDocs(collection(db, "practiceDate"));
  const batch = writeBatch(db);
  const nextIds = new Set(practiceDates.map((practiceDate) => practiceDate.id));

  currentSnapshot.docs.forEach((document) => {
    if (!nextIds.has(document.id)) {
      batch.delete(document.ref);
    }
  });

  practiceDates.forEach((practiceDate) => {
    const reference = doc(db, "practiceDate", practiceDate.id);
    batch.set(reference, {
      date: practiceDate.date.trim(),
      month: Number(practiceDate.month),
      practiceId: practiceDate.practiceId.trim(),
      updateAt: serverTimestamp(),
      updateId: currentUser.uid,
      year: Number(practiceDate.year)
    });
  });

  await batch.commit();
};

const validatePracticeDates = () => {
  return practiceDates.every((practiceDate) => {
    const year = Number(practiceDate.year);
    const month = Number(practiceDate.month);
    return practiceDate.date.trim()
      && practiceDate.practiceId.trim()
      && Number.isInteger(year)
      && year >= 2020
      && year <= 2100
      && Number.isInteger(month)
      && month >= 1
      && month <= 12;
  });
};

const validatePractices = () => {
  return practices.every((practice) => {
    return practice.name.trim()
      && practice.day.trim()
      && practice.time.trim()
      && practice.description.trim();
  });
};

const runMonthlyProcess = async () => {
  const today = new Date();
  const monthlyProcessId = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0")
  ].join("-");
  const monthlyProcessRef = doc(db, "monthly_processes", monthlyProcessId);
  const monthlyProcessSnapshot = await getDoc(monthlyProcessRef);
  if (monthlyProcessSnapshot.exists()) {
    return { skipped: true };
  }

  const postCutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const deleteAllMatching = async (buildQuery) => {
    let deletedCount = 0;

    while (true) {
      const snapshot = await getDocs(buildQuery());
      if (snapshot.empty) {
        return deletedCount;
      }

      await Promise.all(snapshot.docs.map((document) => deleteDoc(document.ref)));
      deletedCount += snapshot.size;
      if (snapshot.size < cleanupBatchSize) {
        return deletedCount;
      }
    }
  };

  const deletedPosts = await deleteAllMatching(() => query(
    collection(db, "posts"),
    where("createAt", "<", postCutoff),
    limit(cleanupBatchSize)
  ));
  const deletedPracticeDates = await deleteAllMatching(() => query(
    collection(db, "practiceDate"),
    where("year", "==", lastMonth.getFullYear()),
    where("month", "==", lastMonth.getMonth() + 1),
    limit(cleanupBatchSize)
  ));

  try {
    await setDoc(monthlyProcessRef, {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      completeF: true,
      completeAt: serverTimestamp()
    });
  } catch (error) {
    const completedSnapshot = await getDoc(monthlyProcessRef);
    if (!completedSnapshot.exists()) {
      throw error;
    }
  }

  return {
    skipped: false,
    deletedPosts,
    deletedPracticeDates
  };
};

const focusPendingField = () => {
  if (!pendingFocus) {
    return;
  }

  const { editor, field, index } = pendingFocus;
  const target = document.querySelector(`[data-editor="${editor}"][data-field="${field}"][data-index="${index}"]`);

  if (target) {
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    target.classList.add("is-focused");
    window.setTimeout(() => {
      target.classList.remove("is-focused");
    }, 1500);
  }

  pendingFocus = null;
};

const renderPracticeEditor = () => {
  practiceEditorList.innerHTML = "";

  if (practices.length === 0) {
    practiceEditorList.innerHTML = `<p class="lead">サークルがありません。「+ サークル」から登録してください。</p>`;
    return;
  }

  practices.forEach((practice, index) => {
    const card = document.createElement("article");
    card.className = `admin-practice-card${pendingFocus?.editor === "practice" && pendingFocus?.index === index ? " is-new" : ""}`;
    card.innerHTML = `
      <div class="admin-card-header">
        <h3>サークル ${index + 1}</h3>
        <button class="icon-button" type="button" data-editor="practice" data-action="delete" data-index="${index}" title="削除" aria-label="削除">×</button>
      </div>
      <div class="admin-form-grid">
        <label>
          <span class="field-label">サークル名 <span class="field-requirement is-required">必須</span></span>
          <input data-editor="practice" data-field="name" data-index="${index}" value="${escapeHtml(practice.name)}" required>
        </label>
        <label>
          <span class="field-label">練習日 <span class="field-requirement is-required">必須</span></span>
          <input data-editor="practice" data-field="day" data-index="${index}" value="${escapeHtml(practice.day)}" required>
        </label>
        <label>
          <span class="field-label">時間 <span class="field-requirement is-required">必須</span></span>
          <input data-editor="practice" data-field="time" data-index="${index}" value="${escapeHtml(practice.time)}" required>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" data-editor="practice" data-field="dispF" data-index="${index}" ${practice.dispF !== false ? "checked" : ""}>
          <span class="field-label">トップページに表示する <span class="field-requirement is-optional">任意</span></span>
        </label>
        <label class="admin-wide">
          <span class="field-label">説明 <span class="field-requirement is-required">必須</span></span>
          <textarea data-editor="practice" data-field="description" data-index="${index}" required>${escapeHtml(practice.description)}</textarea>
        </label>
      </div>
    `;
    practiceEditorList.appendChild(card);
  });
};

const renderPracticeDateEditor = () => {
  practiceDateEditorList.innerHTML = "";

  if (practiceDates.length === 0) {
    practiceDateEditorList.innerHTML = `<p class="lead">月ごとの練習予定がありません。「+ 月予定」から登録してください。</p>`;
    return;
  }

  const practiceOptions = practices.map((practice) => {
    return `<option value="${escapeHtml(practice.id)}">${escapeHtml(practice.name)} / ${escapeHtml(practice.day)}</option>`;
  }).join("");

  practiceDates.forEach((practiceDate, index) => {
    const card = document.createElement("article");
    card.className = `admin-practice-card${pendingFocus?.editor === "practiceDate" && pendingFocus?.index === index ? " is-new" : ""}`;
    card.innerHTML = `
      <div class="admin-card-header">
        <h3>月予定 ${index + 1}</h3>
        <button class="icon-button" type="button" data-editor="practiceDate" data-action="delete" data-index="${index}" title="削除" aria-label="削除">×</button>
      </div>
      <div class="admin-form-grid">
        <label>
          <span class="field-label">年 <span class="field-requirement is-required">必須</span></span>
          <input data-editor="practiceDate" data-field="year" data-index="${index}" type="number" value="${escapeHtml(practiceDate.year)}" required>
        </label>
        <label>
          <span class="field-label">月 <span class="field-requirement is-required">必須</span></span>
          <input data-editor="practiceDate" data-field="month" data-index="${index}" type="number" min="1" max="12" value="${escapeHtml(practiceDate.month)}" required>
        </label>
        <label class="admin-wide">
          <span class="field-label">対象サークル <span class="field-requirement is-required">必須</span></span>
          <select data-editor="practiceDate" data-field="practiceId" data-index="${index}" required>
            <option value="">選択してください</option>
            ${practiceOptions}
          </select>
        </label>
        <label class="admin-wide">
          <span class="field-label">予定本文 <span class="field-requirement is-required">必須</span></span>
          <textarea data-editor="practiceDate" data-field="date" data-index="${index}" required>${escapeHtml(practiceDate.date)}</textarea>
        </label>
      </div>
    `;
    practiceDateEditorList.appendChild(card);

    const select = card.querySelector("select");
    select.value = practiceDate.practiceId;
  });
};

const renderEditor = () => {
  renderPracticeEditor();
  renderPracticeDateEditor();
  window.requestAnimationFrame(() => {
    focusPendingField();
  });
};

const openEditor = async (user) => {
  currentUser = user;
  practices = await fetchPractices();
  [practiceDates] = await Promise.all([
    fetchPracticeDates(),
    loadContactSettings()
  ]);
  loginForm.hidden = true;
  adminEditor.hidden = false;
  adminUser.textContent = `${user.email} でログイン中`;
  renderEditor();
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;
  setLoginStatus("ログインしています...");

  try {
    writeCookie("himawari_admin_email", email);
    await signInWithEmailAndPassword(auth, email, password);
    setLoginStatus("");
  } catch (error) {
    setLoginStatus("ログインできませんでした。メールアドレスとパスワードを確認してください。", true);
  }
});

document.addEventListener("input", (event) => {
  const { editor, field, index } = event.target.dataset;
  const targetIndex = Number(index);
  if (!editor || !field || Number.isNaN(targetIndex)) {
    return;
  }

  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  if (editor === "practice") {
    practices[targetIndex][field] = value;
    renderPracticeDateEditor();
  }
  if (editor === "practiceDate") {
    practiceDates[targetIndex][field] = value;
  }
});

document.addEventListener("change", (event) => {
  const { editor, field, index } = event.target.dataset;
  const targetIndex = Number(index);
  if (editor === "practiceDate" && field && !Number.isNaN(targetIndex)) {
    practiceDates[targetIndex][field] = event.target.value;
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete']");
  if (!button) {
    return;
  }

  const index = Number(button.dataset.index);
  if (button.dataset.editor === "practice") {
    practices.splice(index, 1);
  }
  if (button.dataset.editor === "practiceDate") {
    practiceDates.splice(index, 1);
  }
  renderEditor();
});

addPracticeButton.addEventListener("click", () => {
  practices.push({
    id: createId(),
    name: "",
    day: "",
    time: "",
    description: "",
    dispF: true
  });
  pendingFocus = { editor: "practice", field: "name", index: practices.length - 1 };
  renderEditor();
});

addPracticeDateButton.addEventListener("click", () => {
  practiceDates.push({
    id: createId(),
    date: "",
    month: "",
    practiceId: "",
    year: ""
  });
  pendingFocus = { editor: "practiceDate", field: "year", index: practiceDates.length - 1 };
  renderEditor();
});

saveAllButton.addEventListener("click", async () => {
  const contactEmail = contactEmailInput.value.trim();
  if ((contactFInput.checked || contactEmail) && !isEmailAddress(contactEmail)) {
    setAdminStatus("問い合わせを表示する場合は、正しいメールアドレスを入力してください。", true);
    contactEmailInput.focus();
    return;
  }

  if (!validatePractices()) {
    setAdminStatus("サークルは、サークル名・練習日・時間・説明を入力してください。", true);
    return;
  }

  if (!validatePracticeDates()) {
    setAdminStatus("月ごとの練習予定は、年・月・対象サークル・予定本文を入力してください。", true);
    return;
  }

  setAdminStatus("保存しています...");
  saveAllButton.disabled = true;

  try {
    await saveContactSettings();
    await savePractices();
    await savePracticeDates();
    practices = await fetchPractices();
    practiceDates = await fetchPracticeDates();
    renderEditor();
    setAdminStatus("保存しました。トップページに反映されます。");
  } catch (error) {
    setAdminStatus("保存できませんでした。Firestore Rulesで管理者権限を確認してください。", true);
  } finally {
    saveAllButton.disabled = false;
  }
});

runMonthlyProcessButton.addEventListener("click", async () => {
  runMonthlyProcessButton.disabled = true;
  setAdminStatus("月次処理を実行しています...");

  try {
    const result = await runMonthlyProcess();
    if (result.skipped) {
      setAdminStatus("今月の月次処理はすでに実行済みです。");
      return;
    }

    practiceDates = await fetchPracticeDates();
    renderPracticeDateEditor();
    setAdminStatus(`月次処理が完了しました。投稿 ${result.deletedPosts} 件、先月の練習予定 ${result.deletedPracticeDates} 件を削除しました。`);
  } catch (error) {
    setAdminStatus("月次処理を実行できませんでした。Firestore Rulesを確認してください。", true);
  } finally {
    runMonthlyProcessButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

const restoreAdminLoginForm = () => {
  deleteCookie("himawari_admin_password");

  if (adminEmailInput) {
    const savedEmail = decodeURIComponent(readCookie("himawari_admin_email"));
    if (savedEmail) {
      adminEmailInput.value = savedEmail;
    }
  }

};

restoreAdminLoginForm();

onAuthStateChanged(auth, (user) => {
  if (user) {
    openEditor(user).catch(() => {
      setAdminStatus("データを取得できませんでした。Firestore Rulesを確認してください。", true);
    });
  } else {
    currentUser = null;
    loginForm.hidden = false;
    adminEditor.hidden = true;
    adminUser.textContent = "";
  }
});
