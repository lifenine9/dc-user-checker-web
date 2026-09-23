const dc = require("@gurumnyang/dcinside.js");

function viewUrl(galleryId, galleryType, postNo) {
  const path =
    galleryType === "minor" ? "mgallery/board/view" :
    galleryType === "mini" ? "mini/board/view" :
    "board/view";

  return `https://gall.dcinside.com/${path}/?id=${encodeURIComponent(
    galleryId
  )}&no=${encodeURIComponent(postNo)}`;
}

async function findCommentMatch(posts, gallery, userId) {
  const batchSize = 10;

  for (let start = 0; start < posts.length; start += batchSize) {
    const batch = posts.slice(start, start + batchSize);

    const checks = batch.map((post, index) => {
      return (async () => {
        const postNo = String(post?.id || "").trim();

        if (!postNo) {
          throw new Error("NO_MATCH");
        }

        const detail = await dc.getPost({
          galleryId: gallery,
          postNo,
          extractImages: false
        });

        const comments = detail?.comments?.items || [];

        const found = comments.some(
          comment =>
            String(comment?.author?.userId || "").trim() === userId
        );

        if (!found) {
          throw new Error("NO_MATCH");
        }

        return {
          postNo,
          index
        };
      })();
    });

    try {
      const match = await Promise.any(checks);

      return {
        postNo: match.postNo,
        checkedCount: start + match.index + 1
      };
    } catch {
      // 현재 배치에는 일치하는 댓글이 없음
    }
  }

  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST만 허용됩니다."
    });
  }

  try {
    const {
      galleryId,
      targetUserId,
      postCount,
      galleryType = "major"
    } = req.body || {};

    const gallery = String(galleryId || "").trim();
    const userId = String(targetUserId || "").trim();
    const count = Number(postCount);

    if (!gallery || !userId) {
      return res.status(400).json({
        error: "갤러리와 식별코드를 입력해 주세요."
      });
    }

    if (!Number.isInteger(count) || count < 1 || count > 50000) {
      return res.status(400).json({
        error: "검사 범위가 올바르지 않습니다."
      });
    }

    const postsPerPage = 50;
    const maxPage = Math.ceil(count / postsPerPage);

    const allPosts = [];

    /*
     * 1단계
     * 게시글 목록만 먼저 전부 확인합니다.
     *
     * 여기서는 getPost()를 호출하지 않습니다.
     * 따라서 제목/본문/댓글 내용을 가져오지 않습니다.
     */
    for (let page = 1; page <= maxPage; page++) {
      const posts = await dc.getPostList({
        galleryId: gallery,
        page,
        boardType: "all",
        delayMs: 1000
      });

      if (!posts || posts.length === 0) {
        break;
      }

      const remaining = count - allPosts.length;
      const pagePosts = posts.slice(0, remaining);

      /*
       * 게시글 작성자 식별코드는 목록에서 바로 확인 가능합니다.
       * 하나라도 찾으면 즉시 종료합니다.
       */
      const match = pagePosts.find(
        post => String(post?.author?.userId || "").trim() === userId
      );

      if (match) {
        const postNo = String(match.id);

        return res.status(200).json({
          success: true,
          found: true,
          kind: "post",
          postNo,
          url: viewUrl(gallery, galleryType, postNo),
          checkedCount:
            allPosts.length + pagePosts.indexOf(match) + 1
        });
      }

      allPosts.push(...pagePosts);

      if (pagePosts.length < postsPerPage) {
        break;
      }
    }

    /*
     * 2단계
     * 모든 게시글에서 활동이 없었던 경우에만 댓글을 확인합니다.
     */
    const commentMatch = await findCommentMatch(
      allPosts,
      gallery,
      userId
    );

    if (commentMatch) {
      return res.status(200).json({
        success: true,
        found: true,
        kind: "comment",
        postNo: commentMatch.postNo,
        url: viewUrl(
          gallery,
          galleryType,
          commentMatch.postNo
        ),
        checkedCount: commentMatch.checkedCount
      });
    }

    return res.status(200).json({
      success: true,
      found: false,
      kind: null,
      checkedCount: allPosts.length
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "간편검색 중 오류가 발생했습니다."
    });
  }
};