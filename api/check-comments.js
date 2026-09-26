const dc = require("./dcinside");

function send(res, payload) {
  if (res.writableEnded) return;
  res.write(JSON.stringify(payload) + "\n");
  if (typeof res.flush === "function") res.flush();
}

function setupStream(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST only" });
  }

  let streamed = false;

  try {
    const body = req.body || {};
    const galleryId = String(body.galleryId || "").trim();
    const targetUserId = String(body.targetUserId || "").trim();
    const blockCount = Number(body.blockCount ?? body.postCount);
    const blockStart = Number(body.blockStart ?? 0);
    const blockIndex = Number(body.blockIndex ?? 0);

    if (!galleryId || !targetUserId) {
      return res.status(400).json({
        success: false,
        error: "galleryId와 targetUserId가 필요합니다."
      });
    }

    if (!Number.isInteger(blockCount) || blockCount < 1 || blockCount > 1000) {
      return res.status(400).json({
        success: false,
        error: "댓글 블록 크기가 올바르지 않습니다."
      });
    }

    if (!Number.isInteger(blockStart) || blockStart < 0 || blockStart % 1000 !== 0) {
      return res.status(400).json({
        success: false,
        error: "댓글 블록 위치가 올바르지 않습니다."
      });
    }

    setupStream(res);
    streamed = true;

    const postsPerPage = 50;
    const concurrency = 10;
    const firstPage = Math.floor(blockStart / postsPerPage) + 1;
    const offsetInFirstPage = blockStart % postsPerPage;
    const pagesNeeded = Math.ceil((offsetInFirstPage + blockCount) / postsPerPage);

    const postNumbers = [];
    let reachedEnd = false;

    send(res, {
      type: "progress",
      blockIndex,
      blockStart,
      blockCount,
      checked: 0,
      total: blockCount,
      percent: 0,
      phase: "list"
    });

    for (let pageOffset = 0; pageOffset < pagesNeeded; pageOffset++) {
      const page = firstPage + pageOffset;
      const posts = await dc.getPostList({
        galleryId,
        page,
        boardType: "all",
        delayMs: 1000
      });

      if (!Array.isArray(posts) || posts.length === 0) {
        reachedEnd = true;
        break;
      }

      const start = pageOffset === 0 ? offsetInFirstPage : 0;
      const pagePosts = posts.slice(start, start + (blockCount - postNumbers.length));

      for (const post of pagePosts) {
        const postNo = String(post?.id || "").trim();
        if (postNo) postNumbers.push(postNo);
      }

      if (posts.length < postsPerPage || postNumbers.length >= blockCount) {
        if (posts.length < postsPerPage) reachedEnd = true;
        break;
      }
    }

    if (postNumbers.length === 0 && reachedEnd) {
      send(res, {
        type: "result",
        data: {
          success: true,
          galleryId,
          targetUserId,
          blockIndex,
          blockStart,
          blockEnd: blockStart,
          requestedCount: blockCount,
          checkedCount: 0,
          foundCount: 0,
          postNumbers: [],
          complete: true,
          hasMore: false,
          reachedEnd: true
        }
      });
      if (!res.writableEnded) res.end();
      return;
    }

    const matchedPostNumbers = [];
    let checkedCount = 0;

    for (let i = 0; i < postNumbers.length; i += concurrency) {
      const batch = postNumbers.slice(i, i + concurrency);

      const results = await Promise.all(
        batch.map(async (postNo) => {
          const detail = await dc.getPost({
            galleryId,
            postNo,
            extractImages: false
          });

          const comments = detail?.comments?.items || [];
          const found = comments.some(
            (comment) => String(comment?.author?.userId || "").trim() === targetUserId
          );

          return { postNo, found };
        })
      );

      for (const result of results) {
        checkedCount++;
        if (result.found) matchedPostNumbers.push(result.postNo);
      }

      send(res, {
        type: "progress",
        blockIndex,
        blockStart,
        blockCount,
        checked: checkedCount,
        total: postNumbers.length,
        percent: Math.min(100, Math.floor((checkedCount / Math.max(postNumbers.length, 1)) * 100)),
        phase: "comments"
      });
    }

    const complete = checkedCount === postNumbers.length;
    const hasMore = !reachedEnd && postNumbers.length >= blockCount;

    send(res, {
      type: "result",
      data: {
        success: true,
        galleryId,
        targetUserId,
        blockIndex,
        blockStart,
        blockEnd: blockStart + postNumbers.length,
        requestedCount: blockCount,
        checkedCount,
        foundCount: matchedPostNumbers.length,
        postNumbers: matchedPostNumbers,
        complete,
        hasMore,
        reachedEnd
      }
    });

    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error("check-comments error:", error);

    if (streamed && res.headersSent) {
      send(res, {
        type: "error",
        error: error?.message || "댓글 검사 중 오류가 발생했습니다."
      });
      if (!res.writableEnded) res.end();
      return;
    }

    return res.status(500).json({
      success: false,
      error: error?.message || "댓글 검사 중 오류가 발생했습니다."
    });
  }
};
