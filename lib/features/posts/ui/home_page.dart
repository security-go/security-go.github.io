import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../data/post_repository.dart';
import '_shell.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = const PostRepository();
    final latest = repo.listAll().take(5).toList(growable: false);

    return AppShell(
      title: "Kogoon's Blog",
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '생각과 IT 공부 기록',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'Flutter Web + Markdown(Git) 기반. (댓글/좋아요는 추후)',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Text('최근 글', style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              TextButton(
                onPressed: () => context.go('/posts'),
                child: const Text('전체 보기'),
              ),
            ],
          ),
          const Divider(),
          ...latest.map(
            (p) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(p.title),
              subtitle: Text('${p.date} • ${p.summary}'),
              onTap: () => context.go('/post/${p.slug}'),
            ),
          ),
        ],
      ),
    );
  }
}
