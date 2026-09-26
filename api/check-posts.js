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

    if (!Number.isInteger(blockCount) || blockCount < 1 || blockCount > 5000) {
      return res.status(400).json({
        success: false,
        error: "게시글 블록 크기가 올바르지 않습니다."
      });
    }

    if (!Number.isInteger(blockStart) || blockStart < 0 || blockStart % 5000 !== 0) {
      return res.status(400).json({
        success: false,
        error: "게시글 블록 위치가 올바르지 않습니다."
      });
    }

    setupStream(res);
    streamed = true;

    const postsPerPage = 50;
    const firstPage = Math.floor(blockStart / postsPerPage) + 1;
    const offsetInFirstPage = blockStart % postsPerPage;
    const pagesNeeded = Math.ceil((offsetInFirstPage + blockCount) / postsPerPage);

    const matchedPostNumbers = [];
    let checkedCount = 0;
    let reachedEnd = false;

    send(res, {
      type: "progress",
      blockIndex,
      blockStart,
      blockCount,
      checked: 0,
      total: blockCount,
      percent: 0
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
      const pagePosts = posts.slice(start, start + (blockCount - checkedCount));

      for (const post of pagePosts) {
        checkedCount++;

        const authorId = String(post?.author?.userId || "").trim();
        if (authorId === targetUserId) {
          const postNumber = post?.id ?? post?.no ?? post?.num ?? post?.postNo;
          if (postNumber !== undefined && postNumber !== null) {
            matchedPostNumbers.push(String(postNumber));
          }
        }

        if (checkedCount % 10 === 0 || checkedCount === blockCount) {
          send(res, {
            type: "progress",
            blockIndex,
            blockStart,
            blockCount,
            checked: checkedCount,
            total: blockCount,
            percent: Math.min(100, Math.floor((checkedCount / blockCount) * 100))
          });
        }
      }

      if (posts.length < postsPerPage || checkedCount >= blockCount) {
        if (posts.length < postsPerPage) reachedEnd = true;
        break;
      }
    }

    const complete = checkedCount > 0 || reachedEnd;
    const hasMore = !reachedEnd && checkedCount >= blockCount;

    send(res, {
      type: "progress",
      blockIndex,
      blockStart,
      blockCount,
      checked: checkedCount,
      total: blockCount,
      percent: complete ? Math.floor((checkedCount / blockCount) * 100) : 0
    });

    send(res, {
      type: "result",
      data: {
        success: true,
        galleryId,
        targetUserId,
        blockIndex,
        blockStart,
        blockEnd: blockStart + checkedCount,
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
    console.error("check-posts error:", error);

    if (streamed && res.headersSent) {
      send(res, {
        type: "error",
        error: error?.message || "게시글 검사 중 오류가 발생했습니다."
      });
      if (!res.writableEnded) res.end();
      return;
    }

    return res.status(500).json({
      success: false,
      error: error?.message || "게시글 검사 중 오류가 발생했습니다."
    });
  }
};
