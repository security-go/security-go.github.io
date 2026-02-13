import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/about/about_page.dart';
import '../features/posts/ui/home_page.dart';
import '../features/posts/ui/post_detail_page.dart';
import '../features/posts/ui/post_list_page.dart';
import '../features/posts/ui/tag_page.dart';
import '../features/posts/ui/tags_page.dart';

GoRouter buildRouter() {
  return GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const HomePage(),
      ),
      GoRoute(
        path: '/posts',
        builder: (context, state) => const PostListPage(),
      ),
      GoRoute(
        path: '/post/:slug',
        builder: (context, state) {
          final slug = state.pathParameters['slug']!;
          return PostDetailPage(slug: slug);
        },
      ),
      GoRoute(
        path: '/tags',
        builder: (context, state) => const TagsPage(),
      ),
      GoRoute(
        path: '/tags/:tag',
        builder: (context, state) {
          final tag = state.pathParameters['tag']!;
          return TagPage(tag: tag);
        },
      ),
      GoRoute(
        path: '/about',
        builder: (context, state) => const AboutPage(),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Not found')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(state.error?.toString() ?? 'Page not found'),
      ),
    ),
  );
}
