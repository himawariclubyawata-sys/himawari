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
import { getSettingString, settingCodes } from "./settings.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const form = document.querySelector("#postForm");
const postList = document.querySelector("#postList");
const postPagination = document.querySelector("#postPagination");
const postPrevPageButton = document.querySelector("#postPrevPage");
const postNextPageButton = document.querySelector("#postNextPage");
const postPageStatus = document.querySelector("#postPageStatus");
const boardStatus = document.querySelector("#boardStatus");
const practiceGrid = document.querySelector("#practiceGrid");
const announcementForm = document.querySelector("#announcementForm");
const announcementFormPanel = document.querySelector("#announcementFormPanel");
const toggleAnnouncementFormButton = document.querySelector("#toggleAnnouncementForm");
const announcementList = document.querySelector("#announcementList");
const announcementPagination = document.querySelector("#announcementPagination");
const announcementPrevPageButton = document.querySelector("#announcementPrevPage");
const announcementNextPageButton = document.querySelector("#announcementNextPage");
const announcementPageStatus = document.querySelector("#announcementPageStatus");
const announcementStatus = document.querySelector("#announcementStatus");
const latestAnnouncement = document.querySelector("#latestAnnouncement");
const latestAnnouncementList = document.querySelector("#latestAnnouncementList");
const nameInput = document.querySelector("#name");
const announcementNameInput = document.querySelector("#announcementName");
const announcementPasswordInput = document.querySelector("#announcementPassword");
const boardNameCookieKey = "himawari_board_name";
const announcementNameCookieKey = "himawari_announcement_name";
const announcementPasswordCookieKey = "himawari_announcement_password";
const boardNameCookieMaxAge = 60 * 60 * 24 * 365;
const cleanupBatchSize = 100;

const accentColors = ["var(--court)", "var(--gold)", "var(--coral)"];
let latestPracticeDates = [];
let latestPractices = [];
let latestPosts = [];
let latestAnnouncements = [];
let postPages = [];
let announcementPages = [];
let latestHeaderAnnouncements = [];
let currentPostPageIndex = 0;
let currentAnnouncementPageIndex = 0;
const listPageSize = 5;
const latestAnnouncementLimit = 2;
const latestAnnouncementDisplayMonths = 2;
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

const formatLatestAnnouncementDate = (announcement) => {
  const date = toDate(announcement.updateAt ?? announcement.createAt);
  if (!date) {
    return "";
  }

  return `${new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric"
  }).format(date)}更新`;
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

const setAnnouncementStatus = (message, isError = false) => {
  if (!announcementStatus) {
    return;
  }

  announcementStatus.textContent = message;
  announcementStatus.classList.toggle("is-error", isError);
};

const getCookieValue = (key) => {
  const cookieString = document.cookie;
  if (!cookieString) {
    return "";
  }

  const cookies = cookieString.split(";").map((cookie) => cookie.trim());
  const matchingCookie = cookies.find((cookie) => cookie.startsWith(`${key}=`));
  if (!matchingCookie) {
    return "";
  }

  return decodeURIComponent(matchingCookie.slice(key.length + 1));
};

const setCookieValue = (key, value) => {
  document.cookie = `${key}=${encodeURIComponent(value)}; max-age=${boardNameCookieMaxAge}; path=/; SameSite=Lax`;
};

const restoreBoardName = () => {
  if (!nameInput) {
    return;
  }

  const savedName = getCookieValue(boardNameCookieKey).trim();
  if (savedName) {
    nameInput.value = savedName;
  }
};

const populateAnnouncementNameOptions = () => {
  if (!announcementNameInput) {
    return;
  }

  const values = new Set(["ひまわり", "コスモス", "なでしこ", "管理者"]);
  latestPractices.forEach((practice) => {
    if (practice.name) {
      values.add(practice.name);
    }
  });

  announcementNameInput.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  announcementNameInput.appendChild(placeholder);

  Array.from(values).sort((left, right) => left.localeCompare(right, "ja")).forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    announcementNameInput.appendChild(option);
  });
};

const restoreAnnouncementInputs = () => {
  populateAnnouncementNameOptions();

  if (announcementNameInput) {
    const savedName = getCookieValue(announcementNameCookieKey).trim();
    if (savedName) {
      announcementNameInput.value = savedName;
    }
  }

  if (announcementPasswordInput) {
    announcementPasswordInput.value = getCookieValue(announcementPasswordCookieKey);
  }
};

const saveBoardName = (name) => {
  if (!nameInput || !name) {
    return;
  }

  setCookieValue(boardNameCookieKey, name);
};

const saveAnnouncementInputs = (name, password) => {
  if (announcementNameInput && name) {
    setCookieValue(announcementNameCookieKey, name);
  }

  if (announcementPasswordInput && password) {
    setCookieValue(announcementPasswordCookieKey, password);
  }
};

const loadAnnouncementPassword = async () => {
  return (await getSettingString(db, settingCodes.announcementPassword)).trim();
};

const isEmailAddress = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
    const contactEmail = String(practice.contactEmail ?? "").trim();
    const showContact = practice.contactF === true && isEmailAddress(contactEmail);
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
        ${showContact ? `<a class="button button-primary circle-contact-button" data-item-id="TOP-CIRCLE-CONTACT" href="mailto:${escapeHtml(contactEmail)}"><span aria-hidden="true">@</span>問い合わせ</a>` : ""}
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

const updatePostPagination = () => {
  const currentPage = postPages[currentPostPageIndex];
  const hasPreviousPage = currentPostPageIndex > 0;
  const hasNextPage = Boolean(currentPage?.hasNextPage);

  postPagination.hidden = !hasPreviousPage && !hasNextPage;
  postPrevPageButton.disabled = !hasPreviousPage;
  postNextPageButton.disabled = !hasNextPage;
  postPageStatus.textContent = `${currentPostPageIndex + 1}ページ`;
};

const renderPosts = (posts) => {
  postList.innerHTML = "";
  if (posts.length === 0) {
    renderEmptyPost("遅刻連絡がある場合は、投稿フォームから投稿できます。");
    updatePostPagination();
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
  updatePostPagination();
};

const getAnnouncementSubject = (announcement) => {
  const subject = String(announcement.subject ?? "").trim();
  if (subject) {
    return subject;
  }

  const message = String(announcement.message ?? "").trim().replace(/\s+/g, " ");
  if (!message) {
    return "件名なし";
  }

  return message.length > 30 ? `${message.slice(0, 30)}…` : message;
};

const getLatestAnnouncementCutoff = () => {
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() - latestAnnouncementDisplayMonths, 1);
  const lastDay = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(today.getDate(), lastDay));
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
};

const renderLatestAnnouncements = (announcements) => {
  if (!latestAnnouncement || !latestAnnouncementList) {
    return;
  }

  latestAnnouncementList.innerHTML = "";

  if (announcements.length === 0) {
    latestAnnouncement.hidden = true;
    return;
  }

  announcements.slice(0, latestAnnouncementLimit).forEach((announcement) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const icon = document.createElement("span");
    const subject = document.createElement("span");
    const updateDate = document.createElement("span");

    link.href = "#announcements";
    link.setAttribute("aria-label", `${getAnnouncementSubject(announcement)}の全体連絡を見る`);
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "📢";
    subject.className = "latest-announcement-subject";
    subject.dataset.itemId = "TOP-LATEST-ANNOUNCEMENT-SUBJECT";
    subject.textContent = getAnnouncementSubject(announcement);
    updateDate.className = "latest-announcement-date";
    updateDate.dataset.itemId = "TOP-LATEST-ANNOUNCEMENT-DATE";
    updateDate.textContent = formatLatestAnnouncementDate(announcement);

    link.append(icon, subject, updateDate);
    item.appendChild(link);
    latestAnnouncementList.appendChild(item);
  });

  latestAnnouncement.hidden = false;
};

const updateAnnouncementPagination = () => {
  const currentPage = announcementPages[currentAnnouncementPageIndex];
  const hasPreviousPage = currentAnnouncementPageIndex > 0;
  const hasNextPage = Boolean(currentPage?.hasNextPage);
  announcementPagination.hidden = !hasPreviousPage && !hasNextPage;
  announcementPrevPageButton.disabled = !hasPreviousPage;
  announcementNextPageButton.disabled = !hasNextPage;
  announcementPageStatus.textContent = `${currentAnnouncementPageIndex + 1}ページ`;
};

const renderAnnouncements = (announcements) => {
  if (!announcementList) {
    return;
  }

  announcementList.innerHTML = "";
  renderLatestAnnouncements(latestHeaderAnnouncements);

  if (announcements.length === 0) {
    const empty = document.createElement("li");
    empty.className = "post";
    empty.innerHTML = `
      <div class="post-header">
        <h3 class="post-title">まだ全体連絡はありません</h3>
      </div>
      <p>全体連絡の投稿には投稿用パスが必要です。</p>
    `;
    announcementList.appendChild(empty);
    updateAnnouncementPagination();
    return;
  }

  announcements.forEach((announcement) => {
    const item = document.createElement("li");
    item.className = "post";
    item.innerHTML = `
      <div class="post-header">
        <div>
          <h3 class="post-title" data-item-id="TOP-ANNOUNCEMENTS-POST-SUBJECT">${escapeHtml(getAnnouncementSubject(announcement))}</h3>
          <span class="post-time" data-item-id="TOP-ANNOUNCEMENTS-POST-META">${escapeHtml(announcement.name)} さん・${formatPostDate(announcement.createAt)} 投稿</span>
        </div>
        <button class="post-delete" type="button" data-announcement-id="${escapeHtml(announcement.id)}">削除</button>
      </div>
      <p data-item-id="TOP-ANNOUNCEMENTS-POST-MESSAGE">${escapeHtml(announcement.message)}</p>
    `;
    announcementList.appendChild(item);
  });
  updateAnnouncementPagination();
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
      populateAnnouncementNameOptions();
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

const loadPosts = async ({ reset = false, pageIndex = currentPostPageIndex } = {}) => {
  if (reset) {
    postPages = [];
    pageIndex = 0;
  }

  postPrevPageButton.disabled = true;
  postNextPageButton.disabled = true;

  const cachedPage = postPages[pageIndex];
  if (cachedPage) {
    currentPostPageIndex = pageIndex;
    latestPosts = cachedPage.posts;
    setStatus("");
    renderPosts(latestPosts);
    return;
  }

  const queryParts = [
    collection(db, "posts"),
    orderBy("createAt", "desc"),
    limit(listPageSize + 1)
  ];

  if (pageIndex > 0) {
    const previousPage = postPages[pageIndex - 1];
    if (!previousPage?.lastDocument) {
      throw new Error("前ページの読み込み位置が見つかりません。");
    }
    queryParts.splice(2, 0, startAfter(previousPage.lastDocument));
  }

  const postsQuery = query(...queryParts);
  const snapshot = await getDocs(postsQuery);
  const pageDocuments = snapshot.docs.slice(0, listPageSize);
  const pagePosts = pageDocuments.map((document) => ({ id: document.id, ...document.data() }));

  postPages[pageIndex] = {
    posts: pagePosts,
    lastDocument: pageDocuments.at(-1) || null,
    hasNextPage: snapshot.docs.length > listPageSize
  };
  currentPostPageIndex = pageIndex;
  latestPosts = pagePosts;
  setStatus("");
  renderPosts(latestPosts);
};

const loadAnnouncements = async ({ reset = false, pageIndex = currentAnnouncementPageIndex } = {}) => {
  if (reset) {
    announcementPages = [];
    latestHeaderAnnouncements = [];
    latestAnnouncements = [];
    currentAnnouncementPageIndex = 0;
    pageIndex = 0;
  }

  announcementPrevPageButton.disabled = true;
  announcementNextPageButton.disabled = true;

  const cachedPage = announcementPages[pageIndex];
  if (cachedPage) {
    currentAnnouncementPageIndex = pageIndex;
    latestAnnouncements = cachedPage.announcements;
    renderAnnouncements(latestAnnouncements);
    return;
  }

  const queryParts = [
    collection(db, "announcements"),
    orderBy("createAt", "desc"),
    limit(listPageSize + 1)
  ];

  if (pageIndex > 0) {
    const previousPage = announcementPages[pageIndex - 1];
    if (!previousPage?.lastDocument) {
      throw new Error("前ページの読み込み位置が見つかりません。");
    }
    queryParts.splice(2, 0, startAfter(previousPage.lastDocument));
  }

  const announcementsQuery = query(...queryParts);
  const snapshot = await getDocs(announcementsQuery);
  const pageDocuments = snapshot.docs.slice(0, listPageSize);
  const pageAnnouncements = pageDocuments.map((document) => ({ id: document.id, ...document.data() }));

  announcementPages[pageIndex] = {
    announcements: pageAnnouncements,
    lastDocument: pageDocuments.at(-1) || null,
    hasNextPage: snapshot.docs.length > listPageSize
  };
  if (pageIndex === 0) {
    const cutoff = getLatestAnnouncementCutoff();
    latestHeaderAnnouncements = pageAnnouncements
      .filter((announcement) => {
        const createAt = toDate(announcement.createAt);
        return createAt && createAt >= cutoff;
      })
      .slice(0, latestAnnouncementLimit);
  }
  currentAnnouncementPageIndex = pageIndex;
  latestAnnouncements = pageAnnouncements;
  renderAnnouncements(latestAnnouncements);
};

const subscribeAnnouncements = () => {
  loadAnnouncements({ reset: true }).catch((error) => {
    latestHeaderAnnouncements = [];
    renderLatestAnnouncements(latestHeaderAnnouncements);
    if (announcementList) {
      announcementList.innerHTML = `<li class="post"><p>${escapeHtml(getErrorMessage(error, "全体連絡を読み込めませんでした。"))}</p></li>`;
    }
    updateAnnouncementPagination();
  });
};

const subscribePosts = () => {
  loadPosts({ reset: true }).catch((error) => {
    setStatus(getErrorMessage(error, "投稿を読み込めません。Firestore Rulesを確認してください。"), true);
    postList.innerHTML = "";
    renderEmptyPost("Firestoreに接続できる状態になると投稿一覧が表示されます。" );
  });
};

postPrevPageButton.addEventListener("click", () => {
  loadPosts({ pageIndex: currentPostPageIndex - 1 })
    .then(() => postList.scrollIntoView({ behavior: "smooth", block: "start" }))
    .catch((error) => {
      setStatus(getErrorMessage(error, "前のページを読み込めませんでした。"), true);
      updatePostPagination();
    });
});

postNextPageButton.addEventListener("click", () => {
  loadPosts({ pageIndex: currentPostPageIndex + 1 })
    .then(() => postList.scrollIntoView({ behavior: "smooth", block: "start" }))
    .catch((error) => {
      setStatus(getErrorMessage(error, "次のページを読み込めませんでした。"), true);
      updatePostPagination();
    });
});

announcementPrevPageButton.addEventListener("click", () => {
  loadAnnouncements({ pageIndex: currentAnnouncementPageIndex - 1 })
    .then(() => announcementList.scrollIntoView({ behavior: "smooth", block: "start" }))
    .catch((error) => {
      setAnnouncementStatus(getErrorMessage(error, "前のページを読み込めませんでした。"), true);
      updateAnnouncementPagination();
    });
});

announcementNextPageButton.addEventListener("click", () => {
  loadAnnouncements({ pageIndex: currentAnnouncementPageIndex + 1 })
    .then(() => announcementList.scrollIntoView({ behavior: "smooth", block: "start" }))
    .catch((error) => {
      setAnnouncementStatus(getErrorMessage(error, "次のページを読み込めませんでした。"), true);
      updateAnnouncementPagination();
    });
});

toggleAnnouncementFormButton?.addEventListener("click", () => {
  if (!announcementFormPanel) {
    return;
  }

  const isHidden = announcementFormPanel.hidden;
  announcementFormPanel.hidden = !isHidden;
  toggleAnnouncementFormButton.textContent = isHidden ? "投稿フォームを閉じる" : "投稿フォームを開く";
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
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const deleteAllMatching = async (buildQuery) => {
    while (true) {
      const snapshot = await getDocs(buildQuery());
      if (snapshot.empty) {
        return;
      }

      await Promise.all(snapshot.docs.map((document) => deleteDoc(document.ref)));
      if (snapshot.size < cleanupBatchSize) {
        return;
      }
    }
  };

  await deleteAllMatching(() => query(
    collection(db, "posts"),
    where("createAt", "<", cutoff),
    limit(cleanupBatchSize)
  ));
  await deleteAllMatching(() => query(
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
};

announcementForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = announcementForm.querySelector("button[type='submit']");
  const formData = new FormData(announcementForm);
  const announcement = {
    name: formData.get("announcementName").trim(),
    subject: formData.get("announcementSubject").trim(),
    message: formData.get("announcementMessage").trim(),
    password: formData.get("announcementPassword")
  };

  if (!announcement.name || !announcement.message || !announcement.password) {
    setAnnouncementStatus("サークル名・内容・投稿用パスを入力してください。", true);
    return;
  }

  const configuredPassword = await loadAnnouncementPassword();
  if (!configuredPassword) {
    setAnnouncementStatus("投稿用パスがまだ設定されていません。", true);
    return;
  }

  if (announcement.password !== configuredPassword) {
    setAnnouncementStatus("投稿用パスが違います。", true);
    return;
  }

  submitButton.disabled = true;
  setAnnouncementStatus("投稿しています...");

  try {
    await addDoc(collection(db, "announcements"), {
      name: announcement.name.slice(0, 40),
      subject: announcement.subject.slice(0, 80),
      message: announcement.message.slice(0, 800),
      createAt: serverTimestamp()
    });
    saveAnnouncementInputs(announcement.name, announcement.password);
    announcementForm.reset();
    populateAnnouncementNameOptions();
    if (announcementNameInput) {
      announcementNameInput.value = announcement.name;
    }
    if (announcementPasswordInput) {
      announcementPasswordInput.value = announcement.password;
    }
    await loadAnnouncements({ reset: true });
    setAnnouncementStatus("全体連絡を投稿しました。");
  } catch (error) {
    setAnnouncementStatus(getErrorMessage(error, "全体連絡を投稿できませんでした。Firestore Rulesを確認してください。"), true);
  } finally {
    submitButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector("button[type='submit']");
  const formData = new FormData(form);
  const post = {
    name: formData.get("name").trim(),
    message: formData.get("message").trim()
    ,
    deletePassword: (formData.get("deletePassword") || "").trim()
  };

  if (!post.name || !post.message) {
    setStatus("名前と内容を入力してください。", true);
    return;
  }

  submitButton.disabled = true;
  setStatus("投稿しています...");

  try {
    await addDoc(collection(db, "posts"), {
      name: post.name.slice(0, 40),
      message: post.message.slice(0, 400),
      deletePassword: String(post.deletePassword).slice(0, 80),
      createAt: serverTimestamp()
    });
    saveBoardName(post.name);
    form.reset();
    nameInput.value = post.name;
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

  const expectedPassword = String(post.deletePassword || "").trim();
  const configuredPasswordForPost = await loadAnnouncementPassword();
  if (!expectedPassword) {
    setStatus("この投稿には削除用パスが設定されていないため、画面から削除できません。", true);
    return;
  }

  const password = window.prompt("投稿削除に使うパスを入力してください。");
  if (password === null) {
    return;
  }

  const isValidPassword = password === expectedPassword || (configuredPasswordForPost && password === configuredPasswordForPost);
  if (!isValidPassword) {
    setStatus("削除用パスが違います。", true);
    window.alert("削除用パスが違います。もう一度入力してください。");
    return;
  }

  const confirmed = window.confirm("この投稿を削除しますか？");
  if (!confirmed) {
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

announcementList?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-announcement-id]");
  if (!button) {
    return;
  }

  const announcementId = button.dataset.announcementId;
  const configuredPassword = await loadAnnouncementPassword();
  if (!configuredPassword) {
    setAnnouncementStatus("削除用パスがまだ設定されていません。", true);
    return;
  }

  const password = window.prompt("全体連絡の削除に使うパスを入力してください。");
  if (password === null) {
    return;
  }

  if (password !== configuredPassword) {
    setAnnouncementStatus("削除用パスが違います。", true);
    window.alert("削除用パスが違います。もう一度入力してください。");
    return;
  }

  const confirmed = window.confirm("この全体連絡を削除しますか？");
  if (!confirmed) {
    return;
  }

  button.disabled = true;
  setAnnouncementStatus("削除しています...");

  try {
    await deleteDoc(doc(db, "announcements", announcementId));
    await loadAnnouncements({ reset: true });
    setAnnouncementStatus("全体連絡を削除しました。");
  } catch (error) {
    setAnnouncementStatus(getErrorMessage(error, "全体連絡を削除できませんでした。"), true);
    button.disabled = false;
  }
});

restoreBoardName();
restoreAnnouncementInputs();
void loadAnnouncementPassword();
subscribePractices();
subscribePracticeDates();
subscribePosts();
subscribeAnnouncements();
runMonthlyProcessOnFirstDay().catch((error) => {
  console.error("月次処理に失敗しました。", error);
});
