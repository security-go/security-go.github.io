import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/about/about_page.dart';
import '../features/posts/ui/home_page.dart';
import '../features/posts/ui/post_detail_page.dart';
import '../features/posts/ui/post_list_page.dart';
import '../features/posts/ui/tag_page.dart';
import '../features/posts/ui/tags_page.dart';

const _kTransitionDuration = Duration(milliseconds: 160);
const _kReverseTransitionDuration = Duration(milliseconds: 140);

CustomTransitionPage<T> _buildTransitionPage<T>({
  required GoRouterState state,
  required Widget child,
}) {
  // UX goals:
  // - short duration (feels snappy)
  // - cheap animation (fade + tiny slide)
  // - symmetric reverse (back button feels natural)
  return CustomTransitionPage<T>(
    key: state.pageKey,
    child: child,
    transitionDuration: _kTransitionDuration,
    reverseTransitionDuration: _kReverseTransitionDuration,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final fade = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeOutCubic,
      );

      // A very small slide to avoid "teleport" feeling, but keep it cheap.
      final slide = Tween<Offset>(
        begin: const Offset(0, 0.02),
        end: Offset.zero,
      ).animate(fade);

      return FadeTransition(
        opacity: fade,
        child: SlideTransition(position: slide, child: child),
      );
    },
  );
}

GoRouter buildRouter() {
  return GoRouter(
    routes: [
      GoRoute(
        path: '/',
        pageBuilder: (context, state) =>
            _buildTransitionPage<void>(state: state, child: const HomePage()),
      ),
      GoRoute(
        path: '/posts',
        pageBuilder: (context, state) => _buildTransitionPage<void>(
          state: state,
          child: const PostListPage(),
        ),
      ),
      GoRoute(
        path: '/post/:slug',
        pageBuilder: (context, state) {
          final slug = state.pathParameters['slug']!;
          return _buildTransitionPage<void>(
            state: state,
            child: PostDetailPage(slug: slug),
          );
        },
      ),
      GoRoute(
        path: '/tags',
        pageBuilder: (context, state) =>
            _buildTransitionPage<void>(state: state, child: const TagsPage()),
      ),
      GoRoute(
        path: '/tags/:tag',
        pageBuilder: (context, state) {
          final tag = state.pathParameters['tag']!;
          return _buildTransitionPage<void>(
            state: state,
            child: TagPage(tag: tag),
          );
        },
      ),
      GoRoute(
        path: '/about',
        pageBuilder: (context, state) =>
            _buildTransitionPage<void>(state: state, child: const AboutPage()),
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
