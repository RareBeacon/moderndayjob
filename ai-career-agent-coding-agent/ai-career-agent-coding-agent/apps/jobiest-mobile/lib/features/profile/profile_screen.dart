import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/formatters.dart';
import '../../core/widgets/state_views.dart';
import '../../models/account.dart';
import '../auth/state/auth_controller.dart';
import '../career/career_score_screen.dart';
import '../guide/guide_screen.dart';
import '../resume/resume_screen.dart';
import '../support/support_screen.dart';
import 'data/profile_repository.dart';
import 'edit_profile_screen.dart';
import 'preferences_screen.dart';
import 'security_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _loading = true;
  String? _error;
  AccountOverview? _account;
  Entitlements? _entitlements;
  ProfileCompleteness? _completeness;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repository = context.read<ProfileRepository>();
      final account = await repository.account();
      Entitlements? entitlements;
      ProfileCompleteness? completeness;
      try {
        entitlements = await repository.entitlements();
      } on ApiException {
        entitlements = null;
      }
      try {
        completeness = await repository.completeness();
      } on ApiException {
        completeness = null;
      }
      if (!mounted) return;
      setState(() {
        _account = account;
        _entitlements = entitlements;
        _completeness = completeness;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) await _load();
  }

  /// Real sign-out: confirmation -> provider revocation -> local wipe -> the
  /// root gate returns to the sign-in screen, so no protected screen stays
  /// reachable.
  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out of Jobiest?'),
        content: const Text(
            'You will need your email and password to sign back in. Saved jobs and applications stay on your account.'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Stay signed in'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final auth = context.read<AuthController>();
    final messenger = ScaffoldMessenger.of(context);
    final result = await auth.signOut();
    messenger.showSnackBar(
      SnackBar(
        content: Text(result.revokedOnServer
            ? 'Signed out. Your session was ended on the server.'
            : 'Signed out on this device. The server session could not be revoked (${result.error.isEmpty ? 'network error' : result.error}). Sign in again to refresh your session.'),
        backgroundColor: result.revokedOnServer ? BrandColors.ink : BrandColors.warning,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final config = context.read<AppConfig>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: <Widget>[
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const LoadingView(label: 'Loading your account')
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: <Widget>[
                      _Header(
                        name: _account?.profile.displayName ?? 'Jobiest user',
                        email: _account?.profile.email ?? auth.email ?? '',
                        plan: _entitlements?.planLabel,
                        completeness: _completeness?.percent,
                      ),
                      const SizedBox(height: 18),
                      const SectionHeader(title: 'Career'),
                      _tile(
                        icon: Icons.person_outline,
                        title: 'Edit profile',
                        subtitle: 'Name, target roles, headline, summary, skills',
                        onTap: () => _open(const EditProfileScreen()),
                      ),
                      _tile(
                        icon: Icons.description_outlined,
                        title: 'Resume Studio',
                        subtitle: 'Edit the draft saved to your account',
                        onTap: () => _open(const ResumeScreen()),
                      ),
                      _tile(
                        icon: Icons.speed_outlined,
                        title: 'Career Score',
                        subtitle: 'Profile readiness, plan limits, resume structure scan',
                        onTap: () => _open(const CareerScoreScreen()),
                      ),
                      _tile(
                        icon: Icons.tune_outlined,
                        title: 'Job preferences',
                        subtitle: 'Remote types, locations, employment types, salary floor',
                        onTap: () => _open(const PreferencesScreen()),
                      ),
                      const SizedBox(height: 18),
                      const SectionHeader(title: 'Account'),
                      _tile(
                        icon: Icons.shield_outlined,
                        title: 'Security',
                        subtitle: 'Password, two-factor authentication, active factors',
                        onTap: () => _open(const SecurityScreen()),
                      ),
                      _tile(
                        icon: Icons.workspace_premium_outlined,
                        title: 'Plan and billing',
                        subtitle: _entitlements == null
                            ? 'Plan details are managed on jobiest.com'
                            : '${_entitlements!.planLabel} plan${_entitlements!.onTrial ? ' · trial' : ''}',
                        onTap: () => _openUrl(config.apiUri('/billing').toString()),
                      ),
                      const SizedBox(height: 18),
                      const SectionHeader(title: 'Help'),
                      _tile(
                        icon: Icons.help_outline,
                        title: 'Getting-started guide',
                        subtitle: 'Account, profile, CV, Career Score, jobs, agent, security',
                        onTap: () => _open(const GuideScreen()),
                      ),
                      _tile(
                        icon: Icons.support_agent,
                        title: 'Contact support',
                        subtitle: 'Send a message straight to the Jobiest support team',
                        onTap: () => _open(const SupportScreen()),
                      ),
                      _tile(
                        icon: Icons.privacy_tip_outlined,
                        title: 'Privacy policy',
                        subtitle: 'Opens jobiest.com/privacy',
                        onTap: () => _openUrl(config.apiUri('/privacy').toString()),
                      ),
                      const SizedBox(height: 22),
                      FilledButton.icon(
                        onPressed: _signOut,
                        style: FilledButton.styleFrom(
                          backgroundColor: BrandColors.dangerBg,
                          foregroundColor: BrandColors.danger,
                          minimumSize: const Size.fromHeight(52),
                        ),
                        icon: const Icon(Icons.logout, size: 18),
                        label: const Text('Sign out'),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Signing out ends the session on the server and clears the tokens stored in this '
                        'device\u2019s secure storage.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: BrandColors.muted, fontSize: 12),
                      ),
                      const SizedBox(height: 20),
                      Center(
                        child: Text(
                          'Jobiest for Android · ${config.apiBaseUrl}',
                          style: const TextStyle(color: BrandColors.muted, fontSize: 11.5),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _tile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: BrandColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BrandColors.line),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Icon(icon),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12.5)),
        trailing: const Icon(Icons.chevron_right, size: 20),
      ),
    );
  }

  Future<void> _openUrl(String url) async {
    final opened = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      showAppMessage(context, 'No browser could open that link.', error: true);
    }
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.name,
    required this.email,
    required this.plan,
    required this.completeness,
  });

  final String name;
  final String email;
  final String? plan;
  final int? completeness;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: <Color>[BrandColors.ink, BrandColors.inkSoft],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(
              color: BrandColors.brand,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              initialsOf(name),
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  name,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                ),
                if (email.isNotEmpty)
                  Text(email, style: const TextStyle(color: Color(0xFFB9CCCC), fontSize: 12.5)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  children: <Widget>[
                    if (plan != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: BrandColors.brand,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('$plan plan',
                            style: const TextStyle(
                                color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                      ),
                    if (completeness != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0x33FFFFFF),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('Profile $completeness%',
                            style: const TextStyle(color: Colors.white, fontSize: 11.5)),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
