---
title: async/await 정리
date: 2026-02-10
tags: [dart, async]
summary: Dart의 Future/async/await를 짧게 정리했다.
---

# async/await 정리

- `async` 함수는 `Future`를 반환
- `await`는 `Future`가 완료될 때까지 기다림

## 예시

```dart
Future<int> fetch() async {
  await Future<void>.delayed(const Duration(milliseconds: 100));
  return 42;
}
```
