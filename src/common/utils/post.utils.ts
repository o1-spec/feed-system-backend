export const getPostSelect = (userId: string) => {
  return {
    id: true,
    content: true,
    imageUrl: true,
    likesCount: true,
    commentsCount: true,
    createdAt: true,
    updatedAt: true,
    author: {
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isCelebrity: true,
      },
    },
    likes: {
      where: { userId },
      select: { id: true },
    },
    bookmarks: {
      where: { userId },
      select: { postId: true },
    },
  };
};

export const mapPost = (post: any) => {
  if (!post) return post;
  
  const isLiked = post.likes ? post.likes.length > 0 : false;
  const isBookmarked = post.bookmarks ? post.bookmarks.length > 0 : false;
  
  const mappedPost = { ...post, isLiked, isBookmarked };
  delete mappedPost.likes;
  delete mappedPost.bookmarks;
  
  return mappedPost;
};
