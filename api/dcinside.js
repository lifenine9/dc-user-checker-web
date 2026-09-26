const axios = require("axios");
const cheerio = require("cheerio");

const MOBILE_BASE_URL = "https://m.dcinside.com";
const TIMEOUT = 10000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

const LIST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; SM-G973N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

const POST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://m.dcinside.com/",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function getHtml(url, headers, extra = {}) {
  let lastError;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: TIMEOUT,
        responseType: "text",
        headers,
        ...extra,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY * 2 ** attempt);
      }
    }
  }

  throw lastError || new Error("DCInside 요청에 실패했습니다.");
}

async function getPostList({
  page,
  galleryId,
  boardType = "all",
  delayMs = 0,
} = {}) {
  if (!galleryId || !Number.isInteger(Number(page)) || Number(page) <= 0) {
    return [];
  }

  const qs =
    boardType === "recommend"
      ? `recommend=1&page=${Number(page)}`
      : `page=${Number(page)}`;

  const url = `${MOBILE_BASE_URL}/board/${encodeURIComponent(
    galleryId
  )}?${qs}`;

  try {
    const html = await getHtml(url, LIST_HEADERS, {
      headers: {
        ...LIST_HEADERS,
        Cookie: "list_count=100",
      },
    });

    const $ = cheerio.load(html);
    const posts = [];

    $("ul.gall-detail-lst > li").each((_, el) => {
      const $el = $(el);

      if ($el.find(".pwlink").length || $el.find(".power-lst").length) {
        return;
      }

      const href = $el.find("a").attr("href") || "";
      const idMatch = href.match(/\/board\/[^/]+\/(\d+)/);
      if (!idMatch) return;

      const nickname = $el.find(".blockInfo").attr("data-name") || "";
      const dataInfo = $el.find(".blockInfo").attr("data-info") || "";

      const rawDate = $el.find(".ginfo > li:nth-child(3)").text().trim();
      let date = rawDate;

      if (/^\d{2}:\d{2}$/.test(rawDate)) {
        const today = new Date();
        date = `${today.getFullYear()}.${String(
          today.getMonth() + 1
        ).padStart(2, "0")}.${String(today.getDate()).padStart(
          2,
          "0"
        )} ${rawDate}`;
      } else if (/^\d{2}\.\d{2}$/.test(rawDate)) {
        const today = new Date();
        date = `${today.getFullYear()}.${rawDate}`;
      }

      const klass = (
        $el.find(".subject-add .sp-lst").attr("class") || ""
      ).split(" ");
      const key =
        klass.find((cls) => cls.startsWith("sp-lst-")) || "";

      const TYPE = {
        "sp-lst-txt": "text",
        "sp-lst-img": "picture",
        "sp-lst-recoimg": "recommended",
        "sp-lst-recotxt": "recommended",
      };

      posts.push({
        id: idMatch[1],
        type: TYPE[key] || "unknown",
        subject: $el.find(".ginfo > li:nth-child(1)").text().trim(),
        title: $el.find(".subjectin").text().trim(),
        link: href,
        author: {
          nickname,
          userId: dataInfo.includes(".") ? "" : dataInfo,
          ip: dataInfo.includes(".") ? dataInfo : "",
        },
        date,
        count: Number(
          (
            $el
              .find(".ginfo > li:nth-child(4)")
              .text()
              .trim()
              .replace(/^조회\s*/, "") || "0"
          ).replace(/,/g, "")
        ),
        recommend: Number(
          (
            $el
              .find(".ginfo > li:nth-child(5)")
              .text()
              .trim()
              .replace(/^추천\s*/, "") || "0"
          ).replace(/,/g, "")
        ),
        replyCount: Number(
          ($el.find(".ct").text().trim() || "0").replace(/[^\d]/g, "")
        ),
      });
    });

    return posts;
  } catch (error) {
    console.error(
      `모바일 게시판 ${page} 수집 오류: ${error?.message || error}`
    );
    return [];
  }
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function parseCommentsFromPostHtml($) {
  const items = [];
  let currentParentId = "0";

  $(".all-comment-lst > li").each((_, li) => {
    const $li = $(li);
    const id = String($li.attr("no") || "").trim();
    const nicknameEl = $li.find("a.nick, button.nick").first();
    const nickname = normalizeText(nicknameEl.text()).replace(/^글쓴\s*/, "");
    const userId =
      $li.find(".blockCommentId").first().attr("data-info") || "";
    const ip = ($li.find(".ip").first().text() || "")
      .replace(/[()]/g, "")
      .trim();
    const regDate = normalizeText($li.find("span.date").first().text());

    const memoEl = $li.find("p.txt").first();
    memoEl.find("br").replaceWith("\n");
    const memo = memoEl
      .text()
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!id && !nickname && !memo) return;

    const klass = $li.attr("class") || "";
    const isReply = /\bcomment-add\b/.test(klass);
    const parent = isReply ? currentParentId || "0" : "0";

    if (!isReply) {
      currentParentId = id || currentParentId;
    }

    items.push({
      parent,
      id,
      author: { userId, nickname, ip },
      regDate,
      memo,
    });
  });

  return items;
}

async function getPost({ galleryId, postNo, extractImages = false } = {}) {
  if (!galleryId || postNo === undefined || postNo === null) {
    return null;
  }

  const no = String(postNo).trim();
  if (!no) return null;

  const url = `${MOBILE_BASE_URL}/board/${encodeURIComponent(
    galleryId
  )}/${encodeURIComponent(no)}`;

  try {
    const html = await getHtml(url, POST_HEADERS);
    const $ = cheerio.load(html);
    const comments = parseCommentsFromPostHtml($);

    const totalHidden = $("#reple_totalCnt").attr("value");
    const totalCount = totalHidden
      ? parseInt(totalHidden, 10) || comments.length
      : comments.length;

    return {
      postNo: no,
      comments: {
        totalCount,
        items: comments,
      },
    };
  } catch (error) {
    console.error(
      `모바일 게시글 ${no} 수집 오류: ${error?.message || error} (URL: ${url})`
    );
    return null;
  }
}

module.exports = {
  getPostList,
  getPost,
};
