# my_blog (Flutter Web + Markdown)

## Write posts

Create a new file under:

- `content/posts/<slug>.md`

Example frontmatter:

```md
---
title: 제목
date: 2026-02-13
tags: [flutter, web]
summary: 한 줄 요약
---

# 본문
...
```

## Rebuild the post index

This generates `lib/features/posts/data/post_index.dart`.

```bash
dart run tool/build_posts.dart
```

## Run

```bash
flutter pub get
# (after adding/editing posts)
dart run tool/build_posts.dart
flutter run -d chrome
```
