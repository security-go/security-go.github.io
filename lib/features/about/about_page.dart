import 'package:flutter/material.dart';

import '../posts/ui/_shell.dart';

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppShell(
      title: 'About',
      child: _AboutBody(),
    );
  }
}

class _AboutBody extends StatelessWidget {
  const _AboutBody();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return ListView(
      children: [
        const SizedBox(height: 12),
        Center(
          child: Column(
            children: [
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: cs.primaryContainer,
                ),
                alignment: Alignment.center,
                child: Text(
                  'K',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: cs.onPrimaryContainer,
                      ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                "security-go",
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 600),
                child: Text(
                  '이 블로그는 생각과 IT 공부 기록을 남기기 위한 공간입니다.\n'
                  '여기에 본인 소개/관심사/연락처/이력 등을 채워 넣을 예정이에요.',
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
        const Divider(),
        const SizedBox(height: 12),
        Text('Links', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        _LinkTile(
          title: 'GitHub',
          subtitle: 'https://github.com/security-go',
        ),
        _LinkTile(
          title: 'Email',
          subtitle: 'you@example.com',
        ),
        _LinkTile(
          title: 'LinkedIn',
          subtitle: 'https://linkedin.com/in/your-id',
        ),
      ],
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.open_in_new),
      onTap: () {
        // TODO: Add url_launcher later. For now it's a visual placeholder.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('링크 열기는 추후 추가(url_launcher)')),
        );
      },
    );
  }
}
