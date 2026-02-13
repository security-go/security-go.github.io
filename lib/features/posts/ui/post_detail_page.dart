import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:go_router/go_router.dart';

import '../data/post_repository.dart';
import '_shell.dart';

class PostDetailPage extends StatelessWidget {
  const PostDetailPage({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context) {
    final repo = const PostRepository();
    final post = repo.getBySlug(slug);

    if (post == null) {
      return AppShell(
        title: 'Not found',
        child: Text('Post not found: $slug'),
      );
    }

    return AppShell(
      title: post.title,
      child: FutureBuilder<String>(
        future: repo.loadMarkdown(post),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Text('Failed to load post: ${snapshot.error}');
          }

          final md = snapshot.data ?? '';

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                post.title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(post.date),
                  for (final tag in post.tags)
                    ActionChip(
                      label: Text('#$tag'),
                      onPressed: () => context.go('/tags/$tag'),
                    ),
                ],
              ),
              const Divider(height: 32),
              Expanded(
                child: Markdown(
                  data: _stripFrontMatter(md),
                  selectable: true,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

String _stripFrontMatter(String md) {
  // Removes a leading YAML frontmatter block:
  // ---\n...\n---\n
  final lines = md.split('\n');
  if (lines.isEmpty) return md;
  if (lines.first.trim() != '---') return md;

  final end = lines.indexOf('---', 1);
  if (end == -1) return md;

  return lines.sublist(end + 1).join('\n').trimLeft();
}
