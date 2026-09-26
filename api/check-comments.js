const dc = require("./dcinside");

function send(res, payload) {
  if (res.writableEnded) return;

  res.write(JSON.stringify(payload) + "\n");

  if (typeof res.flush === "function") {
    res.flush();
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST only",
    });
  }

  try {
    const {
      galleryId,
      targetUserId,
      postCount,
    } = req.body || {};

    if (!galleryId || !targetUserId) {
      return res.status(400).json({
        success: false,
        error: "galleryId와 targetUserId가 필요합니다.",
      });
    }

    const count = Number(postCount);

    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 50000
    ) {
      return res.status(400).json({
        success: false,
        error: "postCount가 올바르지 않습니다.",
      });
    }

    const targetId = String(targetUserId).trim();

    // NDJSON 스트리밍
    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "application/x-ndjson; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    res.setHeader(
      "Transfer-Encoding",
      "chunked"
    );

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const matchedPostNumbers = [];
    const checkedPosts = new Set();

    const postsPerPage = 50;
    const totalPages = Math.ceil(
      count / postsPerPage
    );

    // 시작 상태
    send(res, {
      type: "progress",
      checked: 0,
      total: count,
      percent: 0,
    });

    for (
      let page = 1;
      page <= totalPages;
      page++
    ) {
      const posts = await dc.getPostList({
        galleryId,
        page,
        boardType: "all",
        delayMs: 1000,
      });

      if (
        !Array.isArray(posts) ||
        posts.length === 0
      ) {
        break;
      }

      for (const post of posts) {
        if (checkedPosts.size >= count) {
          break;
        }

        const postNo = String(
          post?.id || ""
        ).trim();

        if (!postNo || checkedPosts.has(postNo)) {
          continue;
        }

        checkedPosts.add(postNo);

        try {
          const detail = await dc.getPost({
            galleryId,
            postNo,
            extractImages: false,
          });

          const comments =
            detail?.comments?.items || [];

          const found = comments.some(
            (comment) => {
              const authorId = String(
                comment?.author?.userId || ""
              ).trim();

              return authorId === targetId;
            }
          );

          if (found) {
            matchedPostNumbers.push(postNo);
          }
        } catch (error) {
          // 특정 게시글의 댓글을 가져오지 못해도
          // 전체 검사는 계속 진행
        }

        // 실제 검사한 게시글 기준 진행률
        // 10개마다 전송 + 마지막은 항상 전송
        if (
          checkedPosts.size % 10 === 0 ||
          checkedPosts.size === count
        ) {
          const checked = checkedPosts.size;

          const percent = Math.min(
            100,
            Math.floor(
              (checked / count) * 100
            )
          );

          send(res, {
            type: "progress",
            checked,
            total: count,
            percent,
          });
        }
      }

      if (posts.length < postsPerPage) {
        break;
      }

      if (checkedPosts.size >= count) {
        break;
      }
    }

    const checkedCount = checkedPosts.size;

    // 마지막 실제 검사 결과
    send(res, {
      type: "progress",
      checked: checkedCount,
      total: count,
      percent:
        checkedCount >= count
          ? 100
          : Math.floor(
              (checkedCount / count) * 100
            ),
    });

    send(res, {
      type: "result",
      data: {
        success: true,
        galleryId,
        targetUserId,
        requestedCount: count,
        checkedCount,
        foundCount: matchedPostNumbers.length,
        postNumbers: matchedPostNumbers,
      },
    });

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    console.error(
      "check-comments error:",
      error
    );

    if (res.headersSent) {
      send(res, {
        type: "error",
        error:
          error?.message ||
          "댓글 검사 중 오류가 발생했습니다.",
      });

      if (!res.writableEnded) {
        res.end();
      }

      return;
    }

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "댓글 검사 중 오류가 발생했습니다.",
    });
  }
};