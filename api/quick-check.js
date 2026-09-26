const dc = require("./dcinside");

function viewUrl(galleryId, galleryType, postNo) {
  const path =
    galleryType === "minor" ? "mgallery/board/view" :
    galleryType === "mini" ? "mini/board/view" :
    "board/view";

  return `https://gall.dcinside.com/${path}/?id=${encodeURIComponent(galleryId)}&no=${encodeURIComponent(postNo)}`;
}

async function getBlockPosts(gallery, blockStart, blockCount) {
  const postsPerPage = 50;
  const firstPage = Math.floor(blockStart / postsPerPage) + 1;
  const offsetInFirstPage = blockStart % postsPerPage;
  const pagesNeeded = Math.ceil((offsetInFirstPage + blockCount) / postsPerPage);
  const posts = [];
  let reachedEnd = false;

  for (let pageOffset = 0; pageOffset < pagesNeeded; pageOffset++) {
    const page = firstPage + pageOffset;
    const pageItems = await dc.getPostList({
      galleryId: gallery,
      page,
      boardType: "all",
      delayMs: 1000
    });

    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      reachedEnd = true;
      break;
    }

    const start = pageOffset === 0 ? offsetInFirstPage : 0;
    posts.push(...pageItems.slice(start, start + (blockCount - posts.length)));

    if (pageItems.length < postsPerPage || posts.length >= blockCount) {
      if (pageItems.length < postsPerPage) reachedEnd = true;
      break;
    }
  }

  return { posts, reachedEnd };
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

    const blockSize = maxBlock;
    if (!Number.isInteger(blockStart) || blockStart < 0 || blockStart % blockSize !== 0) {
      return res.status(400).json({ success: false, error: "블록 위치가 올바르지 않습니다." });
    }

    const { posts, reachedEnd } = await getBlockPosts(gallery, blockStart, blockCount);

    if (mode === "post") {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        if (String(post?.author?.userId || "").trim() === userId) {
          const postNo = String(post.id);
          return res.status(200).json({
            success: true,
            found: true,
            kind: "post",
            postNo,
            url: viewUrl(gallery, galleryType, postNo),
            blockIndex,
            blockStart,
            checkedCount: i + 1,
            requestedCount: blockCount,
            reachedEnd
          });
        }
      }

      return res.status(200).json({
        success: true,
        found: false,
        kind: null,
        blockIndex,
        blockStart,
        checkedCount: posts.length,
        requestedCount: blockCount,
        reachedEnd
      });
    }

    const concurrency = 10;

    for (let start = 0; start < posts.length; start += concurrency) {
      const batch = posts.slice(start, start + concurrency);
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
        if (result.found) {
          return res.status(200).json({
            success: true,
            found: true,
            kind: "comment",
            postNo: result.postNo,
            url: viewUrl(gallery, galleryType, result.postNo),
            blockIndex,
            blockStart,
            checkedCount: start + result.index + 1,
            requestedCount: blockCount,
            reachedEnd
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      found: false,
      kind: null,
      blockIndex,
      blockStart,
      checkedCount: posts.length,
      requestedCount: blockCount,
      reachedEnd
    });
  } catch (error) {
    console.error("quick-check error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "간편 검사 중 오류가 발생했습니다."
    });
  }
};
