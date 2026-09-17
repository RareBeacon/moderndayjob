import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/config/app_config.dart';
import 'core/network/api_client.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/state_views.dart';
import 'features/agent/data/agent_repository.dart';
import 'features/applications/data/applications_repository.dart';
import 'features/auth/state/auth_controller.dart';
import 'features/auth/ui/forgot_password_screen.dart';
import 'features/auth/ui/login_screen.dart';
import 'features/auth/ui/mfa_challenge_screen.dart';
import 'features/auth/ui/signup_screen.dart';
import 'features/jobs/data/jobs_repository.dart';
import 'features/profile/data/profile_repository.dart';
import 'features/resume/data/resume_repository.dart';
import 'features/shell/app_shell.dart';
import 'features/support/data/support_repository.dart';

/// Everything the widget tree needs, assembled once in `main()`.
class JobiestDependencies {
  JobiestDependencies({
    required this.config,
    required this.auth,
    required this.api,
    required this.jobs,
    required this.applications,
    required this.agent,
    required this.profile,
    required this.resume,
    required this.support,
  });

  final AppConfig config;
  final AuthController auth;
  final ApiClient api;
  final JobsRepository jobs;
  final ApplicationsRepository applications;
  final AgentRepository agent;
  final ProfileRepository profile;
  final ResumeRepository resume;
  final SupportRepository support;
}

class JobiestApp extends StatelessWidget {
  const JobiestApp({super.key, required this.dependencies});

  final JobiestDependencies dependencies;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: <SingleChildWidget>[
        Provider<AppConfig>.value(value: dependencies.config),
        ChangeNotifierProvider<AuthController>.value(value: dependencies.auth),
        Provider<JobsRepository>.value(value: dependencies.jobs),
        Provider<ApplicationsRepository>.value(value: dependencies.applications),
        Provider<AgentRepository>.value(value: dependencies.agent),
        Provider<ProfileRepository>.value(value: dependencies.profile),
        Provider<ResumeRepository>.value(value: dependencies.resume),
        Provider<SupportRepository>.value(value: dependencies.support),
      ],
      child: MaterialApp(
        title: 'Jobiest',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: const _RootGate(),
      ),
    );
  }
}

/// Single place that decides what the user sees. Protected screens are only
/// reachable from the signed-in branch, so signing out always removes access.
class _RootGate extends StatelessWidget {
  const _RootGate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    switch (auth.status) {
      case AuthStatus.restoring:
        return const _SplashScreen();
      case AuthStatus.signedOut:
        return const LoginScreen();
      case AuthStatus.mfaRequired:
        return const MfaChallengeScreen();
      case AuthStatus.signedIn:
        return const AppShell();
    }
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: BrandColors.ink,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            BrandWordmark(),
            SizedBox(height: 26),
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.4, color: BrandColors.brand),
            ),
          ],
        ),
      ),
    );
  }
}

/// The real Jobiest mark, drawn from the brand artwork's own geometry: the
/// deep-petrol tile with the teal goal dot breaking out of the top-right
/// corner (sampled from `assets/images/app-icon.png` — the same art used for
/// the launcher icon, which is also bundled at full size for future use).
class JobiestMark extends StatelessWidget {
  const JobiestMark({super.key, this.size = 44});

  final double size;

  static const Color _tile = Color(0xFF0C2A2E); // artwork ink
  static const Color _dot = Color(0xFF0AA9A6); // artwork teal

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size * 1.14,
      height: size * 1.14,
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Positioned(
            left: 0,
            bottom: 0,
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                color: _tile,
                borderRadius: BorderRadius.circular(size * 0.26),
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: 0,
            child: Container(
              width: size * 0.32,
              height: size * 0.32,
              decoration: const BoxDecoration(color: _dot, shape: BoxShape.circle),
            ),
          ),
        ],
      ),
    );
  }
}

/// The mark plus the product name, as used on the splash and sign-in screens.
class BrandWordmark extends StatelessWidget {
  const BrandWordmark({super.key, this.light = true});

  final bool light;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        const JobiestMark(size: 42),
        const SizedBox(width: 12),
        Text(
          'Jobiest',
          style: TextStyle(
            color: light ? Colors.white : BrandColors.ink,
            fontSize: 25,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
          ),
        ),
      ],
    );
  }
}

/// Shared helper: shows a SnackBar built from an error message.
void showAppMessage(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: error ? BrandColors.danger : BrandColors.ink,
    ),
  );
}

/// Used by screens that need a full-height scrollable error state.
Widget fullScreenMessage(String message, {VoidCallback? onRetry}) =>
    ErrorView(message: message, onRetry: onRetry);

class ForgotPasswordLink extends StatelessWidget {
  const ForgotPasswordLink({super.key});

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const ForgotPasswordScreen()),
      ),
      child: const Text('Forgot your password?'),
    );
  }
}

class SignupLink extends StatelessWidget {
  const SignupLink({super.key});

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const SignupScreen()),
      ),
      child: const Text('Create an account'),
    );
  }
}
