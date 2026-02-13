import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppShell extends StatelessWidget {
  const AppShell({
    super.key,
    required this.title,
    required this.child,
  });

  /// Page title (shown in AppBar under the global logo/nav layout)
  final String title;
  final Widget child;

  static const double _contentMaxWidth = 900;
  // Header is intentionally a bit wider than the main reading width.
  // (e.g., main 900px, header 990px = +5% each side)
  static const double _headerMaxWidth = _contentMaxWidth * 1.1;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final isDesktop = w >= 1000;
        final horizontalPadding = isDesktop ? 32.0 : 16.0;

        final logoStyle = Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
              fontSize: isDesktop ? 24 : 20,
            );

        final navTextStyle = Theme.of(context).textTheme.labelLarge?.copyWith(
              // ~10–20% larger than default
              fontSize: isDesktop ? 16.5 : 15.5,
              fontWeight: FontWeight.w600,
            );

        final navButtonStyle = TextButton.styleFrom(
          textStyle: navTextStyle,
          padding: EdgeInsets.symmetric(
            horizontal: isDesktop ? 14 : 10,
            vertical: isDesktop ? 12 : 10,
          ),
        );

        return Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            toolbarHeight: isDesktop ? 72 : 64,
            titleSpacing: 0,
            title: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: _headerMaxWidth),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
                  child: Row(
                    children: [
                      // Logo (left) - mark + wordmark
                      InkWell(
                        onTap: () => context.go('/'),
                        borderRadius: BorderRadius.circular(12),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 6,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: isDesktop ? 34 : 30,
                                height: isDesktop ? 34 : 30,
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .primaryContainer,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  'K',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium
                                      ?.copyWith(
                                        fontWeight: FontWeight.w900,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onPrimaryContainer,
                                      ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Text("security-go's blog", style: logoStyle),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(width: 14),

                      // Navigation (left, next to logo)
                      // Use horizontal scroll on narrow widths to avoid overflows.
                      Expanded(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Wrap(
                              spacing: 8,
                              children: [
                                TextButton(
                                  style: navButtonStyle,
                                  onPressed: () => context.go('/'),
                                  child: const Text('Home'),
                                ),
                                TextButton(
                                  style: navButtonStyle,
                                  onPressed: () => context.go('/posts'),
                                  child: const Text('Posts'),
                                ),
                                TextButton(
                                  style: navButtonStyle,
                                  onPressed: () => context.go('/tags'),
                                  child: const Text('Tags'),
                                ),
                                TextButton(
                                  style: navButtonStyle,
                                  onPressed: () => context.go('/about'),
                                  child: const Text('About'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          body: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: _contentMaxWidth),
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: horizontalPadding,
                  vertical: 20,
                ),
                child: child,
              ),
            ),
          ),
        );
      },
    );
  }
}
