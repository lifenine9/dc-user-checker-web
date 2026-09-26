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
      error: "POST only"
    });
  }

  try {
    const {
      galleryId,
      targetUserId,
      postCount
    } = req.body || {};

    if (!galleryId || !targetUserId) {
      return res.status(400).json({
        success: false,
        error: "galleryId와 targetUserId가 필요합니다."
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
        error: "postCount가 올바르지 않습니다."
      });
    }

    const targetId = String(targetUserId).trim();

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
    const concurrency = 10;
    const totalPages = Math.ceil(
      count / postsPerPage
    );

    send(res, {
      type: "progress",
      checked: 0,
      total: count,
      percent: 0
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
        delayMs: 1000
      });

      if (
        !Array.isArray(posts) ||
        posts.length === 0
      ) {
        break;
      }

      const pagePosts = [];

      for (const post of posts) {
        if (checkedPosts.size >= count) {
          break;
        }

        const postNo = String(
          post?.id || ""
        ).trim();

        if (
          !postNo ||
          checkedPosts.has(postNo)
        ) {
          continue;
        }

        checkedPosts.add(postNo);
        pagePosts.push(postNo);
      }

      // 게시글 상세 조회를 10개씩 병렬 처리
      for (
        let i = 0;
        i < pagePosts.length;
        i += concurrency
      ) {
        const batch = pagePosts.slice(
          i,
          i + concurrency
        );

        const results = await Promise.all(
          batch.map(async (postNo) => {
            try {
              const detail = await dc.getPost({
                galleryId,
                postNo,
                extractImages: false
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

              return {
                postNo,
                found
              };
            } catch (error) {
              console.error(
                `comment check failed: ${postNo}`,
                error?.message || error
              );

              return {
                postNo,
                found: false
              };
            }
          })
        );

        for (const result of results) {
          if (result.found) {
            matchedPostNumbers.push(
              result.postNo
            );
          }
        }

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
          percent
        });
      }

      if (posts.length < postsPerPage) {
        break;
      }

      if (checkedPosts.size >= count) {
        break;
      }
    }

    const checkedCount =
      checkedPosts.size;

    send(res, {
      type: "progress",
      checked: checkedCount,
      total: count,
      percent:
        checkedCount >= count
          ? 100
          : Math.floor(
              (checkedCount / count) * 100
            )
    });

    send(res, {
      type: "result",
      data: {
        success: true,
        galleryId,
        targetUserId,
        requestedCount: count,
        checkedCount,
        foundCount:
          matchedPostNumbers.length,
        postNumbers:
          matchedPostNumbers
      }
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
          "댓글 검사 중 오류가 발생했습니다."
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
        "댓글 검사 중 오류가 발생했습니다."
    });
  }
};