class Post {
  const Post({
    required this.slug,
    required this.title,
    required this.date,
    required this.tags,
    required this.summary,
    required this.assetPath,
  });

  final String slug;
  final String title;
  /// ISO-8601 date string: YYYY-MM-DD
  final String date;
  final List<String> tags;
  final String summary;
  /// e.g. content/posts/my-post.md (Flutter asset path)
  final String assetPath;
}
