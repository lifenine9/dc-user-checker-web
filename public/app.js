const $ = (selector) => document.querySelector(selector);

const galleryInput = $("#galleryInput");
const galleryClearButton = $("#galleryClearButton");
const gallerySuggestions = $("#gallerySuggestions");
const selectedGallery = $("#selectedGallery");
const userIdInput = $("#userIdInput");
const userIdClearButton = $("#userIdClearButton");
const rangeSelect = $("#rangeSelect");
const checkButton = $("#checkButton");
const postProgress = $("#postProgress");
const postProgressText = $("#postProgressText");
const postProgressPercent = $("#postProgressPercent");
const postProgressBar = $("#postProgressBar");
const errorBox = $("#error");
const result = $("#result");
const foundCount = $("#foundCount");
const checkedCount = $("#checkedCount");
const postList = $("#postList");
const commentButton = $("#commentButton");
const commentProgress = $("#commentProgress");
const commentProgressText = $("#commentProgressText");
const commentProgressPercent = $("#commentProgressPercent");
const commentProgressBar = $("#commentProgressBar");
const commentResult = $("#commentResult");
const commentFoundCount = $("#commentFoundCount");
const commentCheckedCount = $("#commentCheckedCount");
const commentList = $("#commentList");

const quickButton = $("#quickButton");
const quickProgress = $("#quickProgress");
const quickProgressText = $("#quickProgressText");
const quickElapsed = $("#quickElapsed");
const quickResult = $("#quickResult");
const quickResultGallery = $("#quickResultGallery");
const quickResultUserId = $("#quickResultUserId");
const quickResultTitle = $("#quickResultTitle");
const quickResultMessage = $("#quickResultMessage");
const quickElapsedResult = $("#quickElapsedResult");

const postResultGallery = $("#postResultGallery");
const postResultUserId = $("#postResultUserId");
const commentResultGallery = $("#commentResultGallery");
const commentResultUserId = $("#commentResultUserId");

const postElapsed = $("#postElapsed");
const commentElapsed = $("#commentElapsed");
const postElapsedResult = $("#postElapsedResult");
const commentElapsedResult = $("#commentElapsedResult");

let postTimer = null;
let commentTimer = null;
let quickTimer = null;

let selectedGalleryData = null;
let searchTimer = null;
let searchController = null;
let searchSeq = 0;
const searchCache = new Map();


function galleryUrlByType(id, type) {
  const path =
    type === "minor" ? "mgallery/board/lists" :
    type === "mini" ? "mini/board/lists" :
    "board/lists";

  return `https://gall.dcinside.com/${path}/?id=${encodeURIComponent(id)}`;
}


function viewUrlByType(id, type, postNo) {
  const path =
    type === "minor" ? "mgallery/board/view" :
    type === "mini" ? "mini/board/view" :
    "board/view";

  return `https://gall.dcinside.com/${path}/?id=${encodeURIComponent(id)}&no=${encodeURIComponent(postNo)}`;
}


function normalizeGallery(item) {
  if (!item || typeof item !== "object") return null;

  const pick = (names) => {
    for (const name of names) {
      const value = item[name];

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim()
      ) {
        return String(value).trim();
      }
    }

    return "";
  };

  const id = pick([
    "id",
    "gall_id",
    "gallery_id",
    "gallid",
    "galleryId",
    "value",
    "code",
    "url_id",
    "urlId",
    "name"
  ]);

  if (!id) return null;

  const name =
    pick([
      "ko_name",
      "name_ko",
      "title",
      "gall_name",
      "gallery_name",
      "display_name",
      "displayName",
      "text",
      "keyword",
      "nickname",
      "name"
    ]) || id;

  const rawType = pick([
    "gall_type",
    "gallery_type",
    "type",
    "gallType",
    "galleryType"
  ]).toUpperCase();

  let type = "major";

  if (
    rawType === "M" ||
    rawType === "MINOR" ||
    rawType === "MGALLERY" ||
    item.is_minor === true ||
    item.isMinor === true
  ) {
    type = "minor";
  }

  if (
    rawType === "MI" ||
    rawType === "MINI" ||
    rawType === "MINIGALLERY" ||
    item.is_mini === true ||
    item.isMini === true
  ) {
    type = "mini";
  }

  const suffix =
    type === "minor" ? " 마이너 갤러리" :
    type === "mini" ? " 미니 갤러리" :
    " 갤러리";

  const displayName =
    /갤러리$/.test(name) ? name : name + suffix;

  return {
    id,
    type,
    name: displayName,
    url: galleryUrlByType(id, type)
  };
}


function collectCandidates(data) {
  const result = [];
  const seenNodes = new WeakSet();

  function walk(value, depth = 0) {
    if (!value || depth > 8) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, depth + 1);
      }
      return;
    }

    if (typeof value !== "object") return;
    if (seenNodes.has(value)) return;

    seenNodes.add(value);

    const normalized = normalizeGallery(value);

    if (normalized) {
      result.push(normalized);
    }

    for (const valueItem of Object.values(value)) {
      walk(valueItem, depth + 1);
    }
  }

  walk(data);

  const seen = new Set();

  return result.filter((item) => {
    const key = `${item.type}:${item.id}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}


function jsonpAutocomplete(keyword, signal) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "__dcAuto_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2);

    const script = document.createElement("script");

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "디시 갤러리 검색 시간이 초과되었습니다."
        )
      );
    }, 4500);

    function cleanup() {
      clearTimeout(timer);
      script.remove();

      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }

      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    }

    function onAbort() {
      cleanup();
      reject(
        new DOMException(
          "Aborted",
          "AbortError"
        )
      );
    }

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener(
        "abort",
        onAbort,
        { once: true }
      );
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(
        new Error(
          "디시 갤러리 검색 호출에 실패했습니다."
        )
      );
    };

    script.src =
      "https://search.dcinside.com/autocomplete?callback=" +
      encodeURIComponent(callbackName) +
      "&k=" +
      encodeURIComponent(keyword);

    document.head.appendChild(script);
  });
}


async function searchGallery(keyword, signal) {
  const q = keyword.trim().toLowerCase();

  if (!q) return [];

  if (searchCache.has(q)) {
    return searchCache.get(q);
  }

  const data = await jsonpAutocomplete(
    keyword,
    signal
  );

  const results = collectCandidates(data);

  searchCache.set(q, results);

  return results;
}


function showSuggestionsMessage(message) {
  gallerySuggestions.innerHTML =
    `<div class="suggestion-note">${message}</div>`;

  gallerySuggestions.classList.remove("hidden");
}


function renderSuggestions(results) {
  gallerySuggestions.innerHTML = "";

  for (const item of results) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "suggestion";

    const name = document.createElement("span");

    name.className = "suggestion-name";
    name.textContent = item.name;

    const type = document.createElement("span");

    type.className = "suggestion-type";

    type.textContent =
      item.type === "minor"
        ? "마이너"
        : item.type === "mini"
          ? "미니"
          : "일반";

    button.append(name, type);

    button.addEventListener("click", () => {
      selectGallery(item);
    });

    gallerySuggestions.appendChild(button);
  }

  gallerySuggestions.classList.remove("hidden");
}


function updateClearButtons() {
  galleryClearButton.classList.toggle("hidden", !galleryInput.value);
  userIdClearButton.classList.toggle("hidden", !userIdInput.value);
}

function clearGalleryInput() {
  galleryInput.value = "";
  selectedGalleryData = null;
  selectedGallery.classList.add("hidden");
  selectedGallery.textContent = "";
  gallerySuggestions.classList.add("hidden");
  gallerySuggestions.innerHTML = "";
  searchSeq++;

  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }

  if (searchController) {
    searchController.abort();
    searchController = null;
  }

  updateClearButtons();
}

function clearUserIdInput() {
  userIdInput.value = "";
  updateClearButtons();
  restoreSavedResults();
}

function selectGallery(item) {
  selectedGalleryData = item;

  galleryInput.value = item.name;

  selectedGallery.textContent =
    `선택됨 · ${item.name} (${item.id})`;

  selectedGallery.classList.remove("hidden");

  gallerySuggestions.classList.add("hidden");
  gallerySuggestions.innerHTML = "";
  updateClearButtons();
  setTimeout(restoreSavedResults, 0);
}

galleryClearButton.addEventListener("click", clearGalleryInput);
userIdClearButton.addEventListener("click", clearUserIdInput);

galleryInput.addEventListener("input", () => {
  updateClearButtons();
  const keyword = galleryInput.value.trim();

  selectedGalleryData = null;
  selectedGallery.classList.add("hidden");

  if (searchTimer) {
    clearTimeout(searchTimer);
  }

  if (searchController) {
    searchController.abort();
  }

  if (!keyword) {
    gallerySuggestions.classList.add("hidden");
    gallerySuggestions.innerHTML = "";
    return;
  }

  const seq = ++searchSeq;

  showSuggestionsMessage("검색 중...");

  searchTimer = setTimeout(async () => {
    searchController = new AbortController();

    try {
      const results = await searchGallery(
        keyword,
        searchController.signal
      );

      if (seq !== searchSeq) return;

      if (!results.length) {
        showSuggestionsMessage(
          "검색 결과가 없습니다."
        );
        return;
      }

      renderSuggestions(results);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (seq !== searchSeq) return;

      showSuggestionsMessage(
        "검색에 실패했습니다."
      );
    }
  }, 400);
});


userIdInput.addEventListener("input", () => {
  updateClearButtons();
});

updateClearButtons();

document.addEventListener("click", (event) => {
  if (!event.target.closest(".field-wrap")) {
    gallerySuggestions.classList.add("hidden");
  }
});



const POST_BLOCK_SIZE = 5000;
const COMMENT_BLOCK_SIZE = 1000;
const SESSION_STORAGE_KEY = "dc-user-checker-block-sessions-v1";

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}분 ${String(seconds).padStart(2, "0")}초`;
}

function startElapsedTimer(type) {
  stopElapsedTimer(type);
  const startedAt = Date.now();
  const tick = () => {
    const value = formatElapsed(Date.now() - startedAt);
    if (type === "post") postElapsed.textContent = value;
    if (type === "comment") commentElapsed.textContent = value;
    if (type === "quick") quickElapsed.textContent = value;
  };
  tick();
  const timer = setInterval(tick, 250);
  const ref = { timer, startedAt };
  if (type === "post") postTimer = ref;
  if (type === "comment") commentTimer = ref;
  if (type === "quick") quickTimer = ref;
  return startedAt;
}

function stopElapsedTimer(type) {
  const ref = type === "post" ? postTimer : type === "comment" ? commentTimer : quickTimer;
  if (!ref) return 0;
  clearInterval(ref.timer);
  const elapsed = Date.now() - ref.startedAt;
  const value = formatElapsed(elapsed);
  if (type === "post") {
    postElapsed.textContent = value;
    postTimer = null;
  }
  if (type === "comment") {
    commentElapsed.textContent = value;
    commentTimer = null;
  }
  if (type === "quick") {
    quickElapsed.textContent = value;
    quickTimer = null;
  }
  return elapsed;
}

function updateProgressUI(percent, checked, total, type) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const percentEl = type === "comment" ? commentProgressPercent : postProgressPercent;
  const barEl = type === "comment" ? commentProgressBar : postProgressBar;
  const textEl = type === "comment" ? commentProgressText : postProgressText;
  percentEl.textContent = `${value}%`;
  barEl.style.width = `${value}%`;
  if (Number.isFinite(Number(checked)) && Number.isFinite(Number(total)) && Number(total) > 0) {
    textEl.textContent = `${Number(checked).toLocaleString("ko-KR")} / ${Number(total).toLocaleString("ko-KR")}`;
  }
}

function showProgress(type, total) {
  const box = type === "comment" ? commentProgress : postProgress;
  const elapsedEl = type === "comment" ? commentElapsed : postElapsed;
  box.classList.remove("hidden");
  elapsedEl.textContent = "00분 00초";
  updateProgressUI(0, 0, total, type);
}

function hideProgress(type) {
  (type === "comment" ? commentProgress : postProgress).classList.add("hidden");
}

function setButtonsDisabled(disabled) {
  checkButton.disabled = disabled;
  commentButton.disabled = disabled;
  quickButton.disabled = disabled;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

async function fetchStreamingJson(url, body, onProgress) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "검사에 실패했습니다.");
  }

  if (!response.body) throw new Error("실시간 진행률을 표시할 수 없습니다.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData = null;

  const handleLine = (line) => {
    if (!line.trim()) return;
    let data;
    try { data = JSON.parse(line); } catch { return; }
    if (data.type === "progress") onProgress?.(data);
    if (data.type === "error") throw new Error(data.error || "검사에 실패했습니다.");
    if (data.type === "result") finalData = data.data;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) handleLine(line);
  }

  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);

  if (!finalData) throw new Error("검사 결과를 받지 못했습니다. 검사가 중단되었을 수 있습니다.");
  return finalData;
}

function getSelectedGalleryName() {
  return selectedGalleryData?.name || selectedGalleryData?.id || "";
}

function getStoredSessions() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveStoredSession(type, session) {
  const sessions = getStoredSessions();
  sessions[type] = session;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
}

function getStoredSession(type) {
  return getStoredSessions()[type] || null;
}

function clearStoredSession(type) {
  const sessions = getStoredSessions();
  delete sessions[type];
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
}

function sessionMatches(session, gallery, userId, range) {
  return !!session &&
    session.galleryId === gallery.id &&
    session.targetUserId === userId &&
    Number(session.range) === Number(range);
}

function blockRangeText(start, checked) {
  const from = start + 1;
  const to = start + checked;
  return `${from.toLocaleString("ko-KR")} ~ ${to.toLocaleString("ko-KR")}`;
}

function makeBlockBox(type, data, status = "complete") {
  const box = document.createElement("div");
  box.className = `block-result ${status === "interrupted" ? "block-interrupted" : ""}`;

  const head = document.createElement("div");
  head.className = "block-result-head";

  const title = document.createElement("strong");
  title.textContent = `${type === "post" ? "게시글" : "댓글"} ${Number(data.blockIndex) + 1}블록`;

  const range = document.createElement("span");
  range.textContent = data.checkedCount > 0
    ? blockRangeText(Number(data.blockStart || 0), Number(data.checkedCount || 0))
    : `${Number(data.blockStart || 0) + 1}번째부터`;

  head.append(title, range);
  box.appendChild(head);

  const meta = document.createElement("div");
  meta.className = "block-result-meta";
  meta.textContent = `검사 ${Number(data.checkedCount || 0).toLocaleString("ko-KR")}개 · 발견 ${Number(data.foundCount || 0).toLocaleString("ko-KR")}개`;
  box.appendChild(meta);

  const list = document.createElement("div");
  list.className = "block-post-list";

  if (Array.isArray(data.postNumbers) && data.postNumbers.length) {
    for (const postNo of data.postNumbers) {
      const a = document.createElement("a");
      a.className = "post-link";
      a.href = viewUrlByType(selectedGalleryData.id, selectedGalleryData.type, postNo);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = postNo;
      list.appendChild(a);
    }
  } else {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "이 블록에서는 활동이 없습니다.";
    list.appendChild(empty);
  }

  box.appendChild(list);
  return box;
}

function renderPostSession(session, interrupted = false) {
  postResultGallery.textContent = getSelectedGalleryName();
  postResultUserId.textContent = session.targetUserId;
  postList.innerHTML = "";
  for (const block of session.blocks || []) postList.appendChild(makeBlockBox("post", block));
  foundCount.textContent = (session.blocks || []).reduce((sum, b) => sum + Number(b.foundCount || 0), 0).toLocaleString("ko-KR");
  const postCheckedTotal = (session.blocks || []).reduce((sum, b) => sum + Number(b.checkedCount || 0), 0);
  checkedCount.textContent = `완료 ${postCheckedTotal.toLocaleString("ko-KR")} / ${Number(session.range).toLocaleString("ko-KR")}`;
  postElapsedResult.textContent = session.elapsed ? `소요 ${formatElapsed(session.elapsed)}` : "";

  const oldResume = document.getElementById("postResumeButton");
  oldResume?.remove();
  const oldStatus = document.getElementById("postResumeStatus");
  oldStatus?.remove();

  if (!session.completed) {
    const status = document.createElement("div");
    status.id = "postResumeStatus";
    status.className = "resume-status";
    status.textContent = interrupted ? "검사가 중단되었습니다. 완료된 블록은 저장되어 있습니다." : "검사가 아직 완료되지 않았습니다.";
    result.appendChild(status);

    const button = document.createElement("button");
    button.id = "postResumeButton";
    button.className = "resume-button";
    button.type = "button";
    button.textContent = "이어서 검사";
    button.addEventListener("click", () => runPostInspection(true));
    result.appendChild(button);
  }
  result.classList.remove("hidden");
}

function renderCommentSession(session, interrupted = false) {
  commentResultGallery.textContent = getSelectedGalleryName();
  commentResultUserId.textContent = session.targetUserId;
  commentList.innerHTML = "";
  for (const block of session.blocks || []) commentList.appendChild(makeBlockBox("comment", block));
  commentFoundCount.textContent = (session.blocks || []).reduce((sum, b) => sum + Number(b.foundCount || 0), 0).toLocaleString("ko-KR");
  const commentCheckedTotal = (session.blocks || []).reduce((sum, b) => sum + Number(b.checkedCount || 0), 0);
  commentCheckedCount.textContent = `완료 ${commentCheckedTotal.toLocaleString("ko-KR")} / ${Number(session.range).toLocaleString("ko-KR")}`;
  commentElapsedResult.textContent = session.elapsed ? `소요 ${formatElapsed(session.elapsed)}` : "";

  const oldResume = document.getElementById("commentResumeButton");
  oldResume?.remove();
  const oldStatus = document.getElementById("commentResumeStatus");
  oldStatus?.remove();

  if (!session.completed) {
    const status = document.createElement("div");
    status.id = "commentResumeStatus";
    status.className = "resume-status";
    status.textContent = interrupted ? "검사가 중단되었습니다. 완료된 블록은 저장되어 있습니다." : "검사가 아직 완료되지 않았습니다.";
    commentResult.appendChild(status);

    const button = document.createElement("button");
    button.id = "commentResumeButton";
    button.className = "resume-button";
    button.type = "button";
    button.textContent = "이어서 검사";
    button.addEventListener("click", () => runCommentInspection(true));
    commentResult.appendChild(button);
  }
  commentResult.classList.remove("hidden");
}

function renderQuickBlock(entry) {
  const source = entry.data || {};
  const data = {
    ...source,
    foundCount: source.found ? 1 : 0,
    postNumbers: source.found && source.postNo ? [source.postNo] : []
  };

  const box = makeBlockBox(entry.type, data);
  box.classList.add("quick-block");
  return box;
}

function renderQuickSession(session, interrupted = false, running = false) {
  quickResultGallery.textContent = getSelectedGalleryName();
  quickResultUserId.textContent = session.targetUserId;
  quickResultMessage.innerHTML = "";

  for (const entry of session.blocks || []) {
    quickResultMessage.appendChild(renderQuickBlock(entry));
  }

  const oldResume = document.getElementById("quickResumeButton");
  oldResume?.remove();
  const oldStatus = document.getElementById("quickResumeStatus");
  oldStatus?.remove();
  const oldRunning = document.getElementById("quickRunningStatus");
  oldRunning?.remove();

  if (running) {
    quickResultTitle.textContent = "검사 중입니다.";

    const status = document.createElement("div");
    status.id = "quickRunningStatus";
    status.className = "quick-running-message";
    status.textContent = quickProgressText.textContent || "검사를 진행하고 있습니다.";
    quickResultMessage.appendChild(status);
  } else if (session.found) {
    quickResultTitle.textContent = session.found.kind === "post" ? "게시글 활동을 찾았습니다." : "댓글 활동을 찾았습니다.";
    const info = document.createElement("div");
    info.className = "quick-found-message";
    const a = document.createElement("a");
    a.href = session.found.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = session.found.postNo;
    info.append(document.createTextNode(session.found.kind === "post" ? "발견된 게시글 번호: " : "댓글이 작성된 게시글 번호: "), a);
    quickResultMessage.appendChild(info);
  } else if (session.completed) {
    quickResultTitle.textContent = "활동을 찾지 못했습니다.";
    const info = document.createElement("div");
    info.className = "quick-found-message";
    info.textContent = `최근 ${Number(session.range).toLocaleString("ko-KR")}개 범위에서 게시글과 댓글 활동이 확인되지 않았습니다.`;
    quickResultMessage.appendChild(info);
  } else {
    quickResultTitle.textContent = "검사가 중단되었습니다.";
    const status = document.createElement("div");
    status.id = "quickResumeStatus";
    status.className = "resume-status";
    status.textContent = interrupted ? "완료된 블록은 저장되어 있습니다." : "검사가 아직 완료되지 않았습니다.";
    quickResultMessage.appendChild(status);

    const button = document.createElement("button");
    button.id = "quickResumeButton";
    button.className = "resume-button";
    button.type = "button";
    button.textContent = "이어서 검사";
    button.addEventListener("click", () => runQuickInspection(true));
    quickResultMessage.appendChild(button);
  }

  quickElapsedResult.textContent = session.elapsed ? `소요 ${formatElapsed(session.elapsed)}` : "";
  quickResult.classList.remove("hidden");
}

function createPostSession() {
  return {
    galleryId: selectedGalleryData.id,
    galleryType: selectedGalleryData.type,
    targetUserId: userIdInput.value.trim(),
    range: Number(rangeSelect.value),
    blocks: [],
    nextBlock: 0,
    completedBlocks: 0,
    completed: false,
    elapsed: 0
  };
}

function createCommentSession() {
  return {
    galleryId: selectedGalleryData.id,
    galleryType: selectedGalleryData.type,
    targetUserId: userIdInput.value.trim(),
    range: Number(rangeSelect.value),
    blocks: [],
    nextBlock: 0,
    completedBlocks: 0,
    completed: false,
    elapsed: 0
  };
}

function createQuickSession() {
  return {
    galleryId: selectedGalleryData.id,
    galleryType: selectedGalleryData.type,
    targetUserId: userIdInput.value.trim(),
    range: Number(rangeSelect.value),
    blocks: [],
    postIndex: 0,
    commentIndex: 0,
    nextType: "post",
    postExhausted: false,
    commentExhausted: false,
    found: null,
    completed: false,
    elapsed: 0
  };
}

function validateInputs() {
  const userId = userIdInput.value.trim();
  if (!selectedGalleryData) {
    showError("먼저 갤러리를 검색해서 선택해 주세요.");
    galleryInput.focus();
    return false;
  }
  if (!userId) {
    showError("식별코드를 입력해 주세요.");
    userIdInput.focus();
    return false;
  }
  return true;
}

async function runPostInspection(resume = false) {
  if (!validateInputs()) return;
  clearError();

  const range = Number(rangeSelect.value);
  let session = resume ? getStoredSession("post") : null;
  if (!sessionMatches(session, selectedGalleryData, userIdInput.value.trim(), range)) session = null;
  if (!session) session = createPostSession();

  setButtonsDisabled(true);
  checkButton.textContent = "게시글 검사 중...";
  showProgress("post", POST_BLOCK_SIZE);
  startElapsedTimer("post");

  try {
    const totalBlocks = Math.ceil(range / POST_BLOCK_SIZE);
    while (session.nextBlock < totalBlocks) {
      const blockIndex = session.nextBlock;
      const blockStart = blockIndex * POST_BLOCK_SIZE;
      const blockCount = Math.min(POST_BLOCK_SIZE, range - blockStart);
      postProgressText.textContent = `게시글 ${blockIndex + 1}블록 · ${blockStart + 1} ~ ${blockStart + blockCount}`;

      const data = await fetchStreamingJson("/api/check-posts", {
        galleryId: session.galleryId,
        galleryType: session.galleryType,
        targetUserId: session.targetUserId,
        blockIndex,
        blockStart,
        blockCount
      }, (progress) => {
        updateProgressUI(progress.percent, progress.checked, progress.total, "post");
      });

      session.blocks.push(data);
      session.completedBlocks++;
      session.nextBlock++;
      saveStoredSession("post", session);
      renderPostSession(session);

      if (data.reachedEnd || !data.hasMore) {
        session.completed = true;
        saveStoredSession("post", session);
        renderPostSession(session);
        break;
      }
    }

    if (session.nextBlock >= totalBlocks) {
      session.completed = true;
      saveStoredSession("post", session);
      renderPostSession(session);
    }
  } catch (error) {
    session.elapsed = stopElapsedTimer("post");
    saveStoredSession("post", session);
    renderPostSession(session, true);
    showError(error.message || "게시글 검사가 중단되었습니다.");
    hideProgress("post");
    setButtonsDisabled(false);
    checkButton.textContent = "게시글 검사";
    return;
  }

  session.elapsed = stopElapsedTimer("post");
  session.completed = true;
  saveStoredSession("post", session);
  renderPostSession(session);
  hideProgress("post");
  setButtonsDisabled(false);
  checkButton.textContent = "게시글 검사";
}

async function runCommentInspection(resume = false) {
  if (!validateInputs()) return;
  clearError();

  const range = Number(rangeSelect.value);
  let session = resume ? getStoredSession("comment") : null;
  if (!sessionMatches(session, selectedGalleryData, userIdInput.value.trim(), range)) session = null;
  if (!session) session = createCommentSession();

  setButtonsDisabled(true);
  commentButton.textContent = "댓글 검사 중...";
  showProgress("comment", COMMENT_BLOCK_SIZE);
  startElapsedTimer("comment");

  try {
    const totalBlocks = Math.ceil(range / COMMENT_BLOCK_SIZE);
    while (session.nextBlock < totalBlocks) {
      const blockIndex = session.nextBlock;
      const blockStart = blockIndex * COMMENT_BLOCK_SIZE;
      const blockCount = Math.min(COMMENT_BLOCK_SIZE, range - blockStart);
      commentProgressText.textContent = `댓글 ${blockIndex + 1}블록 · ${blockStart + 1} ~ ${blockStart + blockCount}`;

      const data = await fetchStreamingJson("/api/check-comments", {
        galleryId: session.galleryId,
        galleryType: session.galleryType,
        targetUserId: session.targetUserId,
        blockIndex,
        blockStart,
        blockCount
      }, (progress) => {
        updateProgressUI(progress.percent, progress.checked, progress.total, "comment");
      });

      session.blocks.push(data);
      session.completedBlocks++;
      session.nextBlock++;
      saveStoredSession("comment", session);
      renderCommentSession(session);

      if (data.reachedEnd || !data.hasMore) {
        session.completed = true;
        saveStoredSession("comment", session);
        renderCommentSession(session);
        break;
      }
    }

    if (session.nextBlock >= totalBlocks) {
      session.completed = true;
      saveStoredSession("comment", session);
      renderCommentSession(session);
    }
  } catch (error) {
    session.elapsed = stopElapsedTimer("comment");
    saveStoredSession("comment", session);
    renderCommentSession(session, true);
    showError(error.message || "댓글 검사가 중단되었습니다.");
    hideProgress("comment");
    setButtonsDisabled(false);
    commentButton.textContent = "댓글 검사";
    return;
  }

  session.elapsed = stopElapsedTimer("comment");
  session.completed = true;
  saveStoredSession("comment", session);
  renderCommentSession(session);
  hideProgress("comment");
  setButtonsDisabled(false);
  commentButton.textContent = "댓글 검사";
}

async function runQuickInspection(resume = false) {
  if (!validateInputs()) return;
  clearError();

  const range = Number(rangeSelect.value);
  let session = resume ? getStoredSession("quick") : null;
  if (!sessionMatches(session, selectedGalleryData, userIdInput.value.trim(), range)) session = null;
  if (!session) session = createQuickSession();

  setButtonsDisabled(true);
  quickButton.textContent = "간편 검사 중...";
  quickProgress.classList.remove("hidden");
  quickResult.classList.remove("hidden");
  startElapsedTimer("quick");
  renderQuickSession(session, false, true);

  try {
    const postTotal = Math.ceil(range / POST_BLOCK_SIZE);
    const commentTotal = Math.ceil(range / COMMENT_BLOCK_SIZE);

    while (true) {
      let type = session.nextType;
      if (type === "post" && (session.postIndex >= postTotal || session.postExhausted)) type = "comment";
      if (type === "comment" && (session.commentIndex >= commentTotal || session.commentExhausted)) type = "post";

      const noWork =
        (session.postIndex >= postTotal || session.postExhausted) &&
        (session.commentIndex >= commentTotal || session.commentExhausted);

      if (noWork) {
        session.completed = true;
        break;
      }

      const blockIndex = type === "post" ? session.postIndex : session.commentIndex;
      const blockSize = type === "post" ? POST_BLOCK_SIZE : COMMENT_BLOCK_SIZE;
      const blockStart = blockIndex * blockSize;
      const blockCount = Math.min(blockSize, range - blockStart);

      quickProgressText.textContent = `${type === "post" ? "게시글" : "댓글"} ${blockIndex + 1}블록 검사 중...`;
      renderQuickSession(session, false, true);

      const response = await fetch("/api/quick-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          galleryId: session.galleryId,
          galleryType: session.galleryType,
          targetUserId: session.targetUserId,
          mode: type,
          blockIndex,
          blockStart,
          blockCount
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "간편 검사가 중단되었습니다.");

      session.blocks.push({ type, data });

      if (data.found) {
        session.found = data;
        session.completed = true;
        saveStoredSession("quick", session);
        renderQuickSession(session);
        break;
      }

      if (type === "post") {
        session.postIndex++;
        if (data.reachedEnd) session.postExhausted = true;
        session.nextType = "comment";
      } else {
        session.commentIndex++;
        if (data.reachedEnd) session.commentExhausted = true;
        session.nextType = "post";
      }

      saveStoredSession("quick", session);
      renderQuickSession(session, false, true);
    }
  } catch (error) {
    session.elapsed = stopElapsedTimer("quick");
    saveStoredSession("quick", session);
    renderQuickSession(session, true);
    showError(error.message || "간편 검사가 중단되었습니다.");
    quickProgress.classList.add("hidden");
    setButtonsDisabled(false);
    quickButton.textContent = "간편 검사";
    return;
  }

  session.elapsed = stopElapsedTimer("quick");
  saveStoredSession("quick", session);
  renderQuickSession(session);
  quickProgress.classList.add("hidden");
  setButtonsDisabled(false);
  quickButton.textContent = "간편 검사";
}

checkButton.addEventListener("click", () => runPostInspection(false));
commentButton.addEventListener("click", () => runCommentInspection(false));
quickButton.addEventListener("click", () => runQuickInspection(false));

function restoreSavedResults() {
  if (!selectedGalleryData) return;
  const userId = userIdInput.value.trim();
  const range = Number(rangeSelect.value);
  if (!userId) return;

  const postSession = getStoredSession("post");
  if (sessionMatches(postSession, selectedGalleryData, userId, range)) renderPostSession(postSession, !postSession.completed);

  const commentSession = getStoredSession("comment");
  if (sessionMatches(commentSession, selectedGalleryData, userId, range)) renderCommentSession(commentSession, !commentSession.completed);

  const quickSession = getStoredSession("quick");
  if (sessionMatches(quickSession, selectedGalleryData, userId, range)) renderQuickSession(quickSession, !quickSession.completed);
}

userIdInput.addEventListener("change", restoreSavedResults);
rangeSelect.addEventListener("change", restoreSavedResults);
