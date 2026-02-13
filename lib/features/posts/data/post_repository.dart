import 'package:flutter/services.dart' show rootBundle;

import '../domain/post.dart';
import 'post_index.dart';

class PostRepository {
  const PostRepository();

  List<Post> listAll() {
    final copy = posts.toList(growable: false);
    // Newest first (date string YYYY-MM-DD sorts lexicographically)
    copy.sort((a, b) => b.date.compareTo(a.date));
    return copy;
  }

  List<Post> listByTag(String tag) {
    final normalized = tag.toLowerCase();
    return listAll()
        .where((p) => p.tags.any((t) => t.toLowerCase() == normalized))
        .toList(growable: false);
  }

  Post? getBySlug(String slug) {
    try {
      return posts.firstWhere((p) => p.slug == slug);
    } catch (_) {
      return null;
    }
  }

  Future<String> loadMarkdown(Post post) async {
    return rootBundle.loadString(post.assetPath);
  }
}
