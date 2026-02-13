import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../data/post_repository.dart';
import '_shell.dart';

class PostListPage extends StatelessWidget {
  const PostListPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = const PostRepository();
    final all = repo.listAll();

    return AppShell(
      title: 'Posts',
      child: ListView.separated(
        itemCount: all.length,
        separatorBuilder: (_, i) => const Divider(height: 1),
        itemBuilder: (context, i) {
          final p = all[i];
          return ListTile(
            title: Text(p.title),
            subtitle: Text('${p.date} • ${p.tags.join(', ')}\n${p.summary}'),
            isThreeLine: true,
            onTap: () => context.go('/post/${p.slug}'),
            trailing: Wrap(
              spacing: 8,
              children: [
                for (final tag in p.tags.take(3))
                  ActionChip(
                    label: Text('#$tag'),
                    onPressed: () => context.go('/tags/$tag'),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
