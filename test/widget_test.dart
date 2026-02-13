import 'package:flutter_test/flutter_test.dart';

import 'package:my_blog/main.dart';

void main() {
  testWidgets('App boots', (WidgetTester tester) async {
    await tester.pumpWidget(const BlogApp());
    expect(find.text("Kogoon's Blog"), findsWidgets);
  });
}
