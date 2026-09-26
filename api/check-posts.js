const dc = require("./dcinside");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST only",
    });
  }

  let send = null;

  try {
    const {
      galleryId,
      targetUserId,
      postCount,
    } = req.body || {};

    if (!galleryId || !targetUserId || !postCount) {
      return res.status(400).json({
        success: false,
        error: "galleryId, targetUserId, postCount가 필요합니다.",
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

    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Transfer-Encoding", "chunked");

    if (
      typeof res.flushHeaders === "function"
    ) {
      res.flushHeaders();
    }

    const send = (data) => {
      if (res.writableEnded) return;

      res.write(JSON.stringify(data) + "\n");

      if (typeof res.flush === "function") {
        res.flush();
      }
    };

    const matchedPostNumbers = [];
    const postsPerPage = 50;

    let checkedCount = 0;
    let foundCount = 0;

    const totalPages =
      Math.ceil(count / postsPerPage);

    // 시작 상태
    send({
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
      const posts =
        await dc.getPostList({
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
        if (checkedCount >= count) {
          break;
        }

        checkedCount++;

        const authorId =
          String(
            post?.author?.userId || ""
          ).trim();

        if (
          authorId &&
          authorId ===
            String(targetUserId).trim()
        ) {
          foundCount++;

          const postNumber =
            post?.id ??
            post?.no ??
            post?.num ??
            post?.postNo;

          if (
            postNumber !== undefined &&
            postNumber !== null
          ) {
            matchedPostNumbers.push(
              String(postNumber)
            );
          }
        }

        // 실제 검사한 게시글 기준 진행률
        // 10개마다 전송 + 마지막은 항상 전송
        if (
          checkedCount % 10 === 0 ||
          checkedCount === count
        ) {
          const percent = Math.min(
            100,
            Math.floor(
              (checkedCount / count) * 100
            )
          );

          send({
            type: "progress",
            checked: checkedCount,
            total: count,
            percent,
          });
        }
      }

      if (
        posts.length < postsPerPage
      ) {
        break;
      }

      if (
        checkedCount >= count
      ) {
        break;
      }
    }

    // 마지막 실제 검사 결과
    send({
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

    send({
      type: "result",
      data: {
        success: true,
        galleryId,
        targetUserId,
        requestedCount: count,
        checkedCount,
        foundCount,
        postNumbers:
          matchedPostNumbers,
      },
    });

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    console.error(
      "check-posts error:",
      error
    );

    if (
      res.headersSent &&
      send
    ) {
      send({
        type: "error",
        error:
          error?.message ||
          "게시글 검사 중 오류가 발생했습니다.",
      });

      if (!res.writableEnded) {
        res.end();
      }

      return;
    }

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error:
          error?.message ||
          "게시글 검사 중 오류가 발생했습니다.",
      });
    }

    if (!res.writableEnded) {
      res.end();
    }
  }
};