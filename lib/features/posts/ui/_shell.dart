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

        return Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            toolbarHeight: isDesktop ? 72 : 64,
            titleSpacing: 0,
            title: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: _contentMaxWidth),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
                  child: Row(
                    children: [
                      // Logo (left)
                      InkWell(
                        onTap: () => context.go('/'),
                        child: Text("Kogoon's Blog", style: logoStyle),
                      ),

                      // Middle navigation
                      Expanded(
                        child: Center(
                          child: Wrap(
                            spacing: 8,
                            children: [
                              TextButton(
                                onPressed: () => context.go('/'),
                                child: const Text('Home'),
                              ),
                              TextButton(
                                onPressed: () => context.go('/posts'),
                                child: const Text('Posts'),
                              ),
                            ],
                          ),
                        ),
                      ),

                      // Right-side balance (keeps middle menu visually centered)
                      SizedBox(width: isDesktop ? 180 : 0),
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
