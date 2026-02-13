import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../data/post_repository.dart';
import '_shell.dart';

class TagsPage extends StatelessWidget {
  const TagsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = const PostRepository();
    final tagCounts = repo.tagCounts();
    final tags = tagCounts.keys.toList()..sort();

    return AppShell(
      title: 'Tags',
      child: ListView.separated(
        itemCount: tags.length,
        separatorBuilder: (_, i) => const Divider(height: 1),
        itemBuilder: (context, i) {
          final tag = tags[i];
          final count = tagCounts[tag] ?? 0;
          return ListTile(
            title: Text('#$tag ($count)'),
            subtitle: const Text('태그별 게시글 목록 보기'),
            onTap: () => context.go('/tags/$tag'),
          );
        },
      ),
    );
  }
}
