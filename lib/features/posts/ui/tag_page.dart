import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../data/post_repository.dart';
import '_shell.dart';

class TagPage extends StatelessWidget {
  const TagPage({super.key, required this.tag});

  final String tag;

  @override
  Widget build(BuildContext context) {
    final repo = const PostRepository();
    final list = repo.listByTag(tag);

    return AppShell(
      title: '#$tag',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${list.length} posts', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          const Divider(),
          Expanded(
            child: ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, i) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final p = list[i];
                return ListTile(
                  title: Text(p.title),
                  subtitle: Text('${p.date} • ${p.summary}'),
                  onTap: () => context.go('/post/${p.slug}'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
