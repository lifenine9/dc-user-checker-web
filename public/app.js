const $ = (selector) => document.querySelector(selector);

const galleryInput = $("#galleryInput");
const gallerySuggestions = $("#gallerySuggestions");
const selectedGallery = $("#selectedGallery");
const userIdInput = $("#userIdInput");
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


function selectGallery(item) {
  selectedGalleryData = item;

  galleryInput.value = item.name;

  selectedGallery.textContent =
    `선택됨 · ${item.name} (${item.id})`;

  selectedGallery.classList.remove("hidden");

  gallerySuggestions.classList.add("hidden");
  gallerySuggestions.innerHTML = "";
}


galleryInput.addEventListener("input", () => {
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


document.addEventListener("click", (event) => {
  if (!event.target.closest(".field-wrap")) {
    gallerySuggestions.classList.add("hidden");
  }
});


function formatElapsed(ms) {
  const totalSeconds =
    Math.max(0, Math.floor(ms / 1000));

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return (
    `${String(minutes).padStart(2, "0")}분 ` +
    `${String(seconds).padStart(2, "0")}초`
  );
}


function startElapsedTimer(type) {
  const startedAt = Date.now();

  const tick = () => {
    const value =
      formatElapsed(Date.now() - startedAt);

    if (type === "post") {
      postElapsed.textContent = value;
    }

    if (type === "comment") {
      commentElapsed.textContent = value;
    }

    if (type === "quick") {
      quickElapsed.textContent = value;
    }
  };

  tick();

  const timer = setInterval(tick, 250);

  if (type === "post") {
    postTimer = {
      timer,
      startedAt
    };
  }

  if (type === "comment") {
    commentTimer = {
      timer,
      startedAt
    };
  }

  if (type === "quick") {
    quickTimer = {
      timer,
      startedAt
    };
  }

  return startedAt;
}


function stopElapsedTimer(type) {
  const ref =
    type === "post"
      ? postTimer
      : type === "comment"
        ? commentTimer
        : quickTimer;

  if (!ref) return 0;

  clearInterval(ref.timer);

  const elapsed =
    Date.now() - ref.startedAt;

  const value =
    formatElapsed(elapsed);

  if (type === "post") {
    postElapsed.textContent = value;
  }

  if (type === "comment") {
    commentElapsed.textContent = value;
  }

  if (type === "quick") {
    quickElapsed.textContent = value;
  }

  if (type === "post") {
    postTimer = null;
  }

  if (type === "comment") {
    commentTimer = null;
  }

  if (type === "quick") {
    quickTimer = null;
  }

  return elapsed;
}


function updateProgressUI(
  percent,
  checked,
  total,
  type
) {
  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent) || 0
      )
    );

  const percentEl =
    type === "comment"
      ? commentProgressPercent
      : postProgressPercent;

  const barEl =
    type === "comment"
      ? commentProgressBar
      : postProgressBar;

  const textEl =
    type === "comment"
      ? commentProgressText
      : postProgressText;

  percentEl.textContent = `${value}%`;

  barEl.style.width = `${value}%`;

  if (
    Number.isFinite(checked) &&
    Number.isFinite(total) &&
    total > 0
  ) {
    textEl.textContent =
      `${Number(checked).toLocaleString("ko-KR")} / ` +
      `${Number(total).toLocaleString("ko-KR")}`;
  }
}



function showProgress(
  type,
  total = 0
) {
  if (type === "comment") {
    commentProgress.classList.remove("hidden");

    commentElapsed.textContent =
      "00분 00초";

    updateProgressUI(
      0,
      0,
      total,
      "comment"
    );
  } else {
    postProgress.classList.remove("hidden");

    postElapsed.textContent =
      "00분 00초";

    updateProgressUI(
      0,
      0,
      total,
      "post"
    );
  }
}


function hideProgress(type) {
  if (type === "comment") {
    commentProgress.classList.add("hidden");
  } else {
    postProgress.classList.add("hidden");
  }
}


function setPostLoading(
  loading,
  total = 0
) {
  checkButton.disabled = loading;
  commentButton.disabled = loading;
  quickButton.disabled = loading;

  if (loading) {
    showProgress("post", total);
    startElapsedTimer("post");
  } else {
    hideProgress("post");
  }
}


function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}


function clearError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}


async function fetchStreamingJson(
  url,
  body,
  onProgress
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data =
      await response.json().catch(
        () => ({})
      );

    throw new Error(
      data.error ||
      "검사에 실패했습니다."
    );
  }

  if (!response.body) {
    throw new Error(
      "이 브라우저에서는 실시간 진행률을 표시할 수 없습니다."
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";
  let finalData = null;

  while (true) {
    const {
      value,
      done
    } = await reader.read();

    if (done) break;

    buffer += decoder.decode(
      value,
      { stream: true }
    );

    const lines =
      buffer.split("\n");

    buffer =
      lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      let data;

      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }

      if (data.type === "progress") {
        onProgress(data);
      } else if (data.type === "result") {
        finalData = data.data;
      } else if (data.type === "error") {
        throw new Error(
          data.error ||
          "검사에 실패했습니다."
        );
      }
    }
  }

  if (buffer.trim()) {
    try {
      const data =
        JSON.parse(buffer);

      if (data.type === "progress") {
        onProgress(data);
      }

      if (data.type === "result") {
        finalData = data.data;
      }

      if (data.type === "error") {
        throw new Error(
          data.error ||
          "검사에 실패했습니다."
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== buffer
      ) {
        throw error;
      }
    }
  }

  if (!finalData) {
    throw new Error(
      "검사 결과를 받지 못했습니다."
    );
  }

  return finalData;
}


function getSelectedGalleryName() {
  return (
    selectedGalleryData?.name ||
    selectedGalleryData?.id ||
    ""
  );
}


function renderResults(data) {
  postResultGallery.textContent =
    data.galleryName ||
    getSelectedGalleryName();

  postResultUserId.textContent =
    data.targetUserId ||
    userIdInput.value.trim();

  foundCount.textContent =
    Number(
      data.foundCount || 0
    ).toLocaleString("ko-KR");

  checkedCount.textContent =
    `검사 ${Number(
      data.checkedCount || 0
    ).toLocaleString("ko-KR")}개`;

  postList.innerHTML = "";

  if (!data.postNumbers?.length) {
    const empty =
      document.createElement("div");

    empty.className = "empty";

    empty.textContent =
      "해당 범위에서 작성한 게시글이 없습니다.";

    postList.appendChild(empty);
  } else {
    data.postNumbers.forEach(
      (postNo) => {
        const a =
          document.createElement("a");

        a.className = "post-link";

        a.href =
          viewUrlByType(
            selectedGalleryData.id,
            selectedGalleryData.type,
            postNo
          );

        a.target = "_blank";

        a.rel =
          "noopener noreferrer";

        a.textContent = postNo;

        postList.appendChild(a);
      }
    );
  }

  result.classList.remove("hidden");
}


function renderCommentResults(data) {
  commentResultGallery.textContent =
    data.galleryName ||
    getSelectedGalleryName();

  commentResultUserId.textContent =
    data.targetUserId ||
    userIdInput.value.trim();

  commentFoundCount.textContent =
    Number(
      data.foundCount || 0
    ).toLocaleString("ko-KR");

  commentCheckedCount.textContent =
    `검사 ${Number(
      data.checkedCount || 0
    ).toLocaleString("ko-KR")}개`;

  commentList.innerHTML = "";

  if (!data.postNumbers?.length) {
    const empty =
      document.createElement("div");

    empty.className = "empty";

    empty.textContent =
      "해당 범위에서 작성한 댓글이 없습니다.";

    commentList.appendChild(empty);
  } else {
    data.postNumbers.forEach(
      (postNo) => {
        const a =
          document.createElement("a");

        a.className = "post-link";

        a.href =
          viewUrlByType(
            selectedGalleryData.id,
            selectedGalleryData.type,
            postNo
          );

        a.target = "_blank";

        a.rel =
          "noopener noreferrer";

        a.textContent = postNo;

        commentList.appendChild(a);
      }
    );
  }

  commentResult.classList.remove("hidden");
}


function renderQuickResult(
  data,
  elapsed
) {
  quickResultGallery.textContent =
    data.galleryName ||
    getSelectedGalleryName();

  quickResultUserId.textContent =
    data.targetUserId ||
    userIdInput.value.trim();

  quickElapsedResult.textContent =
    `소요 ${formatElapsed(elapsed)}`;

  if (!data.found) {
    quickResultTitle.textContent =
      "활동을 찾지 못했습니다.";

    quickResultMessage.textContent =
      `최근 ${Number(
        rangeSelect.value
      ).toLocaleString("ko-KR")}개 범위에서 게시글과 댓글 활동이 확인되지 않았습니다.`;

    quickResult.classList.remove("hidden");

    return;
  }

  if (data.kind === "post") {
    quickResultTitle.textContent =
      "게시글 활동을 찾았습니다.";

    quickResultMessage.innerHTML =
      `게시글 번호: <a href="${data.url}" target="_blank" rel="noopener noreferrer">${data.postNo}</a>`;
  } else {
    quickResultTitle.textContent =
      "댓글 활동을 찾았습니다.";

    quickResultMessage.innerHTML =
      `댓글이 작성된 게시글 번호: <a href="${data.url}" target="_blank" rel="noopener noreferrer">${data.postNo}</a>`;
  }

  quickResult.classList.remove("hidden");
}


checkButton.addEventListener(
  "click",
  async () => {
    clearError();

    const userId =
      userIdInput.value.trim();

    const postCount =
      Number(rangeSelect.value);

    if (!selectedGalleryData) {
      showError(
        "먼저 갤러리를 검색해서 선택해 주세요."
      );

      galleryInput.focus();

      return;
    }

    if (!userId) {
      showError(
        "식별코드를 입력해 주세요."
      );

      userIdInput.focus();

      return;
    }

    setPostLoading(
      true,
      postCount
    );

    let data = null;

    try {
      data =
        await fetchStreamingJson(
          "/api/check-posts",
          {
            galleryId:
              selectedGalleryData.id,

            galleryType:
              selectedGalleryData.type,

            targetUserId:
              userId,

            postCount
          },
          (progressData) => {
            updateProgressUI(
              progressData.percent,
              progressData.checked ?? progressData.checkedCount,
              progressData.total ?? progressData.totalCount,
              "post"
            );
          }
        );

      renderResults(data);
    } catch (error) {
      showError(
        error.message ||
        "게시글 검사에 실패했습니다."
      );
    } finally {
      const elapsed =
        stopElapsedTimer("post");

      postElapsedResult.textContent =
        `소요 ${formatElapsed(elapsed)}`;

      if (data) {
        updateProgressUI(
          100,
          data.checkedCount ?? postCount,
          data.requestedCount ?? postCount,
          "post"
        );
      }

      setPostLoading(false);
    }
  }
);


commentButton.addEventListener(
  "click",
  async () => {
    clearError();

    const userId =
      userIdInput.value.trim();

    const postCount =
      Number(rangeSelect.value);

    if (!selectedGalleryData) {
      showError(
        "먼저 갤러리를 검색해서 선택해 주세요."
      );

      galleryInput.focus();

      return;
    }

    if (!userId) {
      showError(
        "식별코드를 입력해 주세요."
      );

      userIdInput.focus();

      return;
    }

    checkButton.disabled = true;
    commentButton.disabled = true;
    quickButton.disabled = true;

    commentButton.textContent =
      "댓글 검사 중...";

    commentProgress.classList.remove(
      "hidden"
    );

    updateProgressUI(
      0,
      0,
      postCount,
      "comment"
    );

    startElapsedTimer("comment");


    let data = null;

    try {
      const data =
        await fetchStreamingJson(
          "/api/check-comments",
          {
            galleryId:
              selectedGalleryData.id,

            galleryType:
              selectedGalleryData.type,

            targetUserId:
              userId,

            postCount
          },
          (progressData) => {
            updateProgressUI(
              progressData.percent,
              progressData.checked ?? progressData.checkedCount,
              progressData.total ?? progressData.totalCount,
              "comment"
            );
          }
        );

      renderCommentResults(data);
    } catch (error) {
      showError(
        error.message ||
        "댓글 검사에 실패했습니다."
      );
    } finally {
        const elapsed =
          stopElapsedTimer("comment");

        commentElapsedResult.textContent =
          `소요 ${formatElapsed(elapsed)}`;

        if (data) {
          const checked =
            data.checkedCount ?? 0;

          const total =
            data.requestedCount ??
            postCount;

          updateProgressUI(
            100,
            checked,
            total,
            "comment"
          );
        }

        commentProgress.classList.add(
          "hidden"
        );

        checkButton.disabled = false;
        commentButton.disabled = false;
        quickButton.disabled = false;

        commentButton.textContent =
          "댓글 검사";
      }
  }
);


quickButton.addEventListener(
  "click",
  async () => {
    clearError();

    const userId =
      userIdInput.value.trim();

    const postCount =
      Number(rangeSelect.value);

    if (!selectedGalleryData) {
      showError(
        "먼저 갤러리를 검색해서 선택해 주세요."
      );

      galleryInput.focus();

      return;
    }

    if (!userId) {
      showError(
        "식별코드를 입력해 주세요."
      );

      userIdInput.focus();

      return;
    }

    quickButton.disabled = true;
    checkButton.disabled = true;
    commentButton.disabled = true;

    quickResult.classList.add(
      "hidden"
    );

    quickProgress.classList.remove(
      "hidden"
    );

    quickProgressText.textContent =
      "게시글 활동부터 확인하고 있습니다.";

    startElapsedTimer("quick");

    try {
      const response =
        await fetch(
          "/api/quick-check",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              galleryId:
                selectedGalleryData.id,

              galleryType:
                selectedGalleryData.type,

              targetUserId:
                userId,

              postCount
            })
          }
        );

      data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          "간편검색에 실패했습니다."
        );
      }

      if (!data.success) {
        throw new Error(
          data.error ||
          "간편검색에 실패했습니다."
        );
      }

      const elapsed =
        stopElapsedTimer("quick");

      if (
        data.found &&
        data.kind === "comment"
      ) {
        quickProgressText.textContent =
          "게시글이 없어 댓글 활동을 확인했습니다.";
      } else if (
        data.found &&
        data.kind === "post"
      ) {
        quickProgressText.textContent =
          "게시글 활동을 찾았습니다.";
      } else {
        quickProgressText.textContent =
          "게시글과 댓글 활동을 확인했습니다.";
      }

      renderQuickResult(
        data,
        elapsed
      );
    } catch (error) {
      stopElapsedTimer("quick");

      showError(
        error.message ||
        "간편검색에 실패했습니다."
      );
    } finally {
      quickProgress.classList.add(
        "hidden"
      );

      quickButton.disabled = false;
      checkButton.disabled = false;
      commentButton.disabled = false;
    }
  }
);