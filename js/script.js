import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const form = document.querySelector("#postForm");
const postList = document.querySelector("#postList");
const loadMorePostsButton = document.querySelector("#loadMorePosts");
const boardStatus = document.querySelector("#boardStatus");
const practiceGrid = document.querySelector("#practiceGrid");

const accentColors = ["var(--court)", "var(--gold)", "var(--coral)"];
let latestPracticeDates = [];
let latestPractices = [];
let latestPosts = [];
let lastPostDocument = null;
let hasMorePosts = false;
const postsPageSize = 10;

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

const toDate = (value) => {
  if (!value) {
    return null;
  }
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatUpdateDate = (value) => {
  const date = toDate(value);
  if (!date) {
    return "update:-";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `update:${year}/${month}/${day}`;
};

const formatPostDate = (value) => {
  const date = toDate(value);
  if (!date) {
    return "投稿中";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const isNew = (value) => {
  const date = toDate(value);
  if (!date) {
    return false;
  }

  const twoWeeks = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - date.getTime() <= twoWeeks;
};

const setStatus = (message, isError = false) => {
  boardStatus.textContent = message;
  boardStatus.classList.toggle("is-error", isError);
};

const getErrorMessage = (error, fallback) => {
  console.error(fallback, error);
  return error?.code ? `${fallback} (${error.code})` : fallback;
};

const getPracticeDates = (practiceId) => {
  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const displayMonths = new Set([
    `${currentMonth.getFullYear()}-${currentMonth.getMonth() + 1}`,
    `${nextMonth.getFullYear()}-${nextMonth.getMonth() + 1}`
  ]);

  return latestPracticeDates
    .filter((practiceDate) => practiceDate.practiceId === practiceId)
    .filter((practiceDate) => displayMonths.has(`${Number(practiceDate.year)}-${Number(practiceDate.month)}`))
    .sort((a, b) => {
      const left = `${a.year}${String(a.month).padStart(2, "0")}`;
      const right = `${b.year}${String(b.month).padStart(2, "0")}`;
      return left.localeCompare(right);
    });
};

const renderPracticeDateCards = (practiceId) => {
  const practiceDates = getPracticeDates(practiceId);

  if (practiceDates.length === 0) {
    return `<p class="lead">現在、掲載中の練習予定はありません。</p>`;
  }

  return `
    <div class="schedule-scroll" data-item-id="TOP-SCHEDULE-LIST" aria-label="月ごとの練習予定">
      ${practiceDates.map((practiceDate) => `
        <article class="schedule-card" data-item-id="TOP-SCHEDULE-CARD">
          ${isNew(practiceDate.updateAt) ? `<span class="new-badge" data-item-id="TOP-SCHEDULE-NEW">NEW</span>` : ""}
          <h4 data-item-id="TOP-SCHEDULE-TITLE">${escapeHtml(practiceDate.month)}月の練習予定</h4>
          <p data-item-id="TOP-SCHEDULE-BODY">${escapeHtml(practiceDate.date)}</p>
          <small data-item-id="TOP-SCHEDULE-UPDATE">${escapeHtml(formatUpdateDate(practiceDate.updateAt))}</small>
        </article>
      `).join("")}
    </div>
  `;
};

const renderPractices = (practices) => {
  const visiblePractices = practices.filter((practice) => practice.dispF !== false);
  practiceGrid.innerHTML = "";

  if (visiblePractices.length === 0) {
    practiceGrid.innerHTML = `<p class="lead">現在、公開中のサークルはありません。</p>`;
    return;
  }

  visiblePractices.forEach((practice, index) => {
    const color = accentColors[index % accentColors.length];
    const row = document.createElement("article");
    row.className = "circle-row";
    row.dataset.itemId = "TOP-CIRCLE-ROW";
    row.style.setProperty("--accent", color);
    row.innerHTML = `
      <div class="circle-card" data-item-id="TOP-CIRCLE-CARD">
        ${isNew(practice.updateAt) ? `<span class="new-badge" data-item-id="TOP-CIRCLE-NEW">NEW</span>` : ""}
        <h3 data-item-id="TOP-CIRCLE-NAME">${escapeHtml(practice.name)}</h3>
        <dl class="circle-meta">
          <div>
            <dt>練習日</dt>
            <dd data-item-id="TOP-CIRCLE-DAY">${escapeHtml(practice.day)}</dd>
          </div>
          <div>
            <dt>時間</dt>
            <dd data-item-id="TOP-CIRCLE-TIME">${escapeHtml(practice.time)}</dd>
          </div>
        </dl>
        <p data-item-id="TOP-CIRCLE-DESCRIPTION">${escapeHtml(practice.description)}</p>
        <small data-item-id="TOP-CIRCLE-UPDATE">${escapeHtml(formatUpdateDate(practice.updateAt))}</small>
      </div>
      <div class="circle-schedule">
        ${renderPracticeDateCards(practice.id)}
      </div>
    `;
    practiceGrid.appendChild(row);
  });
};

const renderEmptyPost = (message) => {
  const empty = document.createElement("li");
  empty.className = "post";
  empty.innerHTML = `
    <div class="post-header">
      <h3 class="post-title">まだ投稿はありません</h3>
    </div>
    <p>${escapeHtml(message)}</p>
  `;
  postList.appendChild(empty);
};

const updateLoadMorePostsButton = () => {
  loadMorePostsButton.hidden = !hasMorePosts;
  loadMorePostsButton.disabled = false;
};

const renderPosts = (posts) => {
  postList.innerHTML = "";
  if (posts.length === 0) {
    renderEmptyPost("遅刻連絡がある場合は、投稿フォームから投稿できます。");
    updateLoadMorePostsButton();
    return;
  }

  posts.forEach((post) => {
    const item = document.createElement("li");
    item.className = "post";
    item.innerHTML = `
      <div class="post-header">
        <div>
          <h3 class="post-title" data-item-id="TOP-BOARD-POST-NAME">${escapeHtml(post.name)} さん</h3>
          <span class="post-time" data-item-id="TOP-BOARD-POST-TIME">${formatPostDate(post.createAt)} 投稿</span>
        </div>
        <button class="post-delete" type="button" data-item-id="TOP-BOARD-POST-DELETE" data-post-id="${escapeHtml(post.id)}">削除</button>
      </div>
      <p data-item-id="TOP-BOARD-POST-MESSAGE">${escapeHtml(post.message)}</p>
    `;
    postList.appendChild(item);
  });
  updateLoadMorePostsButton();
};

const renderPracticeArea = () => {
  renderPractices(latestPractices);
};

const subscribePractices = () => {
  onSnapshot(
    collection(db, "practices"),
    (snapshot) => {
      latestPractices = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => `${a.day}${a.time}${a.name}`.localeCompare(`${b.day}${b.time}${b.name}`, "ja"));
      renderPracticeArea();
    },
    (error) => {
      practiceGrid.innerHTML = `<p class="lead">${escapeHtml(getErrorMessage(error, "サークル一覧を読み込めませんでした。"))}</p>`;
    }
  );
};

const subscribePracticeDates = () => {
  onSnapshot(
    collection(db, "practiceDate"),
    (snapshot) => {
      latestPracticeDates = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
      renderPracticeArea();
    },
    (error) => {
      practiceGrid.innerHTML = `<p class="lead">${escapeHtml(getErrorMessage(error, "月ごとの練習予定を読み込めませんでした。"))}</p>`;
    }
  );
};

const loadPosts = async ({ reset = false } = {}) => {
  if (reset) {
    latestPosts = [];
    lastPostDocument = null;
    hasMorePosts = false;
  }

  loadMorePostsButton.disabled = true;
  const queryParts = [
    collection(db, "posts"),
    orderBy("createAt", "desc"),
    limit(postsPageSize + 1)
  ];

  if (lastPostDocument) {
    queryParts.splice(2, 0, startAfter(lastPostDocument));
  }

  const postsQuery = query(...queryParts);
  const snapshot = await getDocs(postsQuery);
  const pageDocuments = snapshot.docs.slice(0, postsPageSize);
  const pagePosts = pageDocuments.map((document) => ({ id: document.id, ...document.data() }));

  latestPosts = reset ? pagePosts : [...latestPosts, ...pagePosts];
  lastPostDocument = pageDocuments.at(-1) || lastPostDocument;
  hasMorePosts = snapshot.docs.length > postsPageSize;
  setStatus("");
  renderPosts(latestPosts);
};

const subscribePosts = () => {
  loadPosts({ reset: true }).catch((error) => {
    setStatus(getErrorMessage(error, "投稿を読み込めません。Firestore Rulesを確認してください。"), true);
    postList.innerHTML = "";
    renderEmptyPost("Firestoreに接続できる状態になると投稿一覧が表示されます。");
  });
};

loadMorePostsButton.addEventListener("click", () => {
  loadPosts().catch((error) => {
    setStatus(getErrorMessage(error, "追加の投稿を読み込めませんでした。"), true);
    updateLoadMorePostsButton();
  });
});

const runMonthlyProcessOnFirstDay = async () => {
  const today = new Date();
  if (today.getDate() !== 1) {
    return;
  }

  const cleanupId = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0")
  ].join("-");
  const monthlyProcessRef = doc(db, "monthly_processes", cleanupId);
  const monthlyProcessSnapshot = await getDoc(monthlyProcessRef);
  if (monthlyProcessSnapshot.exists()) {
    return;
  }

  const cutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const oldPostsQuery = query(collection(db, "posts"), where("createAt", "<", cutoff), limit(100));
  const oldPostsSnapshot = await getDocs(oldPostsQuery);

  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthPracticeDatesQuery = query(
    collection(db, "practiceDate"),
    where("year", "==", lastMonth.getFullYear()),
    where("month", "==", lastMonth.getMonth() + 1),
    limit(100)
  );
  const lastMonthPracticeDatesSnapshot = await getDocs(lastMonthPracticeDatesQuery);

  await Promise.all([
    ...oldPostsSnapshot.docs.map((document) => deleteDoc(document.ref)),
    ...lastMonthPracticeDatesSnapshot.docs.map((document) => deleteDoc(document.ref))
  ]);

  await setDoc(monthlyProcessRef, {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    completeF: true,
    completeAt: serverTimestamp()
  });
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector("button[type='submit']");
  const formData = new FormData(form);
  const post = {
    name: formData.get("name").trim(),
    message: formData.get("message").trim(),
    deletePassword: formData.get("deletePassword").trim()
  };

  if (!post.name || !post.message || !post.deletePassword) {
    setStatus("名前、内容、削除用パスワードを入力してください。", true);
    return;
  }

  submitButton.disabled = true;
  setStatus("投稿しています...");

  try {
    await addDoc(collection(db, "posts"), {
      name: post.name.slice(0, 40),
      message: post.message.slice(0, 400),
      deletePassword: post.deletePassword.slice(0, 80),
      createAt: serverTimestamp()
    });
    form.reset();
    setStatus("投稿しました。");
    await loadPosts({ reset: true });
  } catch (error) {
    setStatus(getErrorMessage(error, "投稿できませんでした。Firestore Rulesを確認してください。"), true);
  } finally {
    submitButton.disabled = false;
  }
});

postList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-post-id]");
  if (!button) {
    return;
  }

  const postId = button.dataset.postId;
  const post = latestPosts.find((item) => item.id === postId);
  if (!post) {
    setStatus("削除対象の投稿が見つかりませんでした。", true);
    return;
  }

  if (!post.deletePassword) {
    setStatus("この投稿には削除用パスワードが保存されていないため、画面から削除できません。", true);
    return;
  }

  const password = window.prompt("投稿時に入力した削除用パスワードを入力してください。");
  if (password === null) {
    return;
  }

  if (password.trim() !== String(post.deletePassword).trim()) {
    setStatus("削除用パスワードが違います。", true);
    return;
  }

  button.disabled = true;
  setStatus("削除しています...");

  try {
    await deleteDoc(doc(db, "posts", postId));
    setStatus("投稿を削除しました。");
    await loadPosts({ reset: true });
  } catch (error) {
    setStatus(getErrorMessage(error, "投稿を削除できませんでした。Firestore Rulesを確認してください。"), true);
    button.disabled = false;
  }
});

subscribePractices();
subscribePracticeDates();
subscribePosts();
runMonthlyProcessOnFirstDay().catch((error) => {
  console.error("月次処理に失敗しました。", error);
});
