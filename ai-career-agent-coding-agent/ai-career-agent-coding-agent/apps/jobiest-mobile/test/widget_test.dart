import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jobiest_mobile/core/theme/app_theme.dart';
import 'package:jobiest_mobile/core/widgets/state_views.dart';

void main() {
  testWidgets('EmptyView shows the real copy and fires its action', (tester) async {
    var tapped = false;
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: EmptyView(
          title: 'No saved jobs yet',
          message: 'Tap the bookmark on any listing.',
          actionLabel: 'Browse jobs',
          onAction: () => tapped = true,
        ),
      ),
    ));

    expect(find.text('No saved jobs yet'), findsOneWidget);
    expect(find.text('Tap the bookmark on any listing.'), findsOneWidget);
    await tester.tap(find.text('Browse jobs'));
    expect(tapped, isTrue);
  });

  testWidgets('ErrorView retries through the supplied callback', (tester) async {
    var retried = false;
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: ErrorView(
          message: 'No connection to Jobiest.',
          onRetry: () => retried = true,
        ),
      ),
    ));

    expect(find.text('No connection to Jobiest.'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    expect(retried, isTrue);
  });

  testWidgets('LoadingView renders an indeterminate indicator', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: LoadingView(label: 'Loading your applications')),
    ));

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('Loading your applications'), findsOneWidget);
  });

  testWidgets('InfoBanner renders its tone without inventing content', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: InfoBanner(
          message: 'Automatic submission is not enabled on your plan.',
          tone: InfoTone.warning,
        ),
      ),
    ));

    expect(find.text('Automatic submission is not enabled on your plan.'), findsOneWidget);
    expect(find.byIcon(Icons.warning_amber_outlined), findsOneWidget);
  });
}
