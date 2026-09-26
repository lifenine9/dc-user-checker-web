const dc = require("./dcinside");

function viewUrl(galleryId, galleryType, postNo) {
  const path =
    galleryType === "minor" ? "mgallery/board/view" :
    galleryType === "mini" ? "mini/board/view" :
    "board/view";

  return `https://gall.dcinside.com/${path}/?id=${encodeURIComponent(galleryId)}&no=${encodeURIComponent(postNo)}`;
}

const POSTS_PER_PAGE = 50;
const PAGE_DELAY_MS = 1000;
const COMMENT_CONCURRENCY = 10;

async function scanPostBlock({ gallery, userId, blockStart, blockCount, blockIndex, galleryType }) {
  const firstPage = Math.floor(blockStart / POSTS_PER_PAGE) + 1;
  const offsetInFirstPage = blockStart % POSTS_PER_PAGE;
  let checkedCount = 0;
  let reachedEnd = false;

  const pagesNeeded = Math.ceil((offsetInFirstPage + blockCount) / POSTS_PER_PAGE);

  for (let pageOffset = 0; pageOffset < pagesNeeded; pageOffset++) {
    const page = firstPage + pageOffset;
    const pageItems = await dc.getPostList({
      galleryId: gallery,
      page,
      boardType: "all",
      delayMs: PAGE_DELAY_MS
    });

    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      reachedEnd = true;
      break;
    }

    const start = pageOffset === 0 ? offsetInFirstPage : 0;
    const items = pageItems.slice(start, start + (blockCount - checkedCount));

    for (const post of items) {
      checkedCount++;
      if (String(post?.author?.userId || "").trim() === userId) {
        const postNo = String(post.id);
        return {
          success: true,
          found: true,
          kind: "post",
          postNo,
          url: viewUrl(gallery, galleryType, postNo),
          blockIndex,
          blockStart,
          checkedCount,
          requestedCount: blockCount,
          reachedEnd: false
        };
      }
    }

    if (pageItems.length < POSTS_PER_PAGE || checkedCount >= blockCount) {
      if (pageItems.length < POSTS_PER_PAGE) reachedEnd = true;
      break;
    }
  }

  return {
    success: true,
    found: false,
    kind: null,
    blockIndex,
    blockStart,
    checkedCount,
    requestedCount: blockCount,
    reachedEnd
  };
}

async function scanCommentBlock({ gallery, userId, blockStart, blockCount, blockIndex, galleryType }) {
  const firstPage = Math.floor(blockStart / POSTS_PER_PAGE) + 1;
  const offsetInFirstPage = blockStart % POSTS_PER_PAGE;
  let checkedCount = 0;
  let reachedEnd = false;

  const pagesNeeded = Math.ceil((offsetInFirstPage + blockCount) / POSTS_PER_PAGE);

  for (let pageOffset = 0; pageOffset < pagesNeeded; pageOffset++) {
    const page = firstPage + pageOffset;
    const pageItems = await dc.getPostList({
      galleryId: gallery,
      page,
      boardType: "all",
      delayMs: PAGE_DELAY_MS
    });

    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      reachedEnd = true;
      break;
    }

    const start = pageOffset === 0 ? offsetInFirstPage : 0;
    const items = pageItems.slice(start, start + (blockCount - checkedCount));

    for (let startIndex = 0; startIndex < items.length; startIndex += COMMENT_CONCURRENCY) {
      const batch = items.slice(startIndex, startIndex + COMMENT_CONCURRENCY);

      const results = await Promise.all(
        batch.map(async (post, index) => {
          const postNo = String(post?.id || "").trim();
          if (!postNo) return { found: false, postNo: "", index };

          const detail = await dc.getPost({
            galleryId: gallery,
            postNo,
            extractImages: false
          });

          const comments = detail?.comments?.items || [];
          const found = comments.some(
            comment => String(comment?.author?.userId || "").trim() === userId
          );

          return { found, postNo, index };
        })
      );

      for (const result of results) {
        checkedCount += 1;
        if (result.found) {
          return {
            success: true,
            found: true,
            kind: "comment",
            postNo: result.postNo,
            url: viewUrl(gallery, galleryType, result.postNo),
            blockIndex,
            blockStart,
            checkedCount,
            requestedCount: blockCount,
            reachedEnd: false
          };
        }
      }
    }

    if (pageItems.length < POSTS_PER_PAGE || checkedCount >= blockCount) {
      if (pageItems.length < POSTS_PER_PAGE) reachedEnd = true;
      break;
    }
  }

  return {
    success: true,
    found: false,
    kind: null,
    blockIndex,
    blockStart,
    checkedCount,
    requestedCount: blockCount,
    reachedEnd
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST만 허용됩니다." });
  }

  try {
    const body = req.body || {};
    const gallery = String(body.galleryId || "").trim();
    const userId = String(body.targetUserId || "").trim();
    const galleryType = body.galleryType || "major";
    const mode = body.mode === "comment" ? "comment" : "post";
    const blockCount = Number(body.blockCount);
    const blockStart = Number(body.blockStart ?? 0);
    const blockIndex = Number(body.blockIndex ?? 0);

    const maxBlock = mode === "post" ? 5000 : 1000;

    if (!gallery || !userId) {
      return res.status(400).json({ success: false, error: "갤러리와 식별코드를 입력해 주세요." });
    }

    if (!Number.isInteger(blockCount) || blockCount < 1 || blockCount > maxBlock) {
      return res.status(400).json({ success: false, error: "블록 크기가 올바르지 않습니다." });
    }

    if (!Number.isInteger(blockStart) || blockStart < 0 || blockStart % maxBlock !== 0) {
      return res.status(400).json({ success: false, error: "블록 위치가 올바르지 않습니다." });
    }

    const args = { gallery, userId, blockStart, blockCount, blockIndex, galleryType };
    const data = mode === "post"
      ? await scanPostBlock(args)
      : await scanCommentBlock(args);

    return res.status(200).json(data);
  } catch (error) {
    console.error("quick-check error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "간편 검사 중 오류가 발생했습니다."
    });
  }
};
