import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../app.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../auth/data/auth_api.dart';
import '../auth/state/auth_controller.dart';

/// Account security: password change through the auth provider, and TOTP
/// second factors. The factor endpoints are the provider's own — the same ones
/// the website's settings page uses, so an authenticator enrolled here works on
/// the web too (and vice versa).
class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  final _codeController = TextEditingController();
  final _enrollmentCodeController = TextEditingController();

  bool _busy = false;
  bool _loadingFactors = true;
  String? _notice;
  bool _noticeIsError = false;
  List<MfaFactor> _factors = <MfaFactor>[];
  TotpEnrollment? _enrollment;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadFactors());
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    _codeController.dispose();
    _enrollmentCodeController.dispose();
    super.dispose();
  }

  void _setNotice(String message, {bool error = false}) {
    setState(() {
      _notice = message;
      _noticeIsError = error;
    });
  }

  Future<void> _loadFactors() async {
    setState(() => _loadingFactors = true);
    try {
      final factors = await context.read<AuthController>().refreshFactors();
      if (!mounted) return;
      setState(() {
        _factors = factors;
        _loadingFactors = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _loadingFactors = false);
      _setNotice(error.message, error: true);
    }
  }

  Future<void> _changePassword() async {
    final password = _passwordController.text;
    if (password.length < 8) {
      _setNotice('Your new password needs at least 8 characters.', error: true);
      return;
    }
    if (password != _confirmController.text) {
      _setNotice('The two passwords do not match.', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AuthController>().changePassword(password);
      if (!mounted) return;
      _passwordController.clear();
      _confirmController.clear();
      _setNotice('Password updated. Use it the next time you sign in.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _beginEnrollment() async {
    setState(() => _busy = true);
    try {
      final enrollment =
          await context.read<AuthController>().beginTotpEnrollment('Jobiest Android');
      if (!mounted) return;
      setState(() => _enrollment = enrollment);
      _setNotice(
          'Add this key to your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then confirm with the 6-digit code it shows.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmEnrollment() async {
    final enrollment = _enrollment;
    if (enrollment == null) return;
    final code = _enrollmentCodeController.text.trim();
    if (code.length < 6) {
      _setNotice('Enter the 6-digit code from your authenticator app.', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AuthController>().confirmTotpEnrollment(
            factorId: enrollment.factorId,
            code: code,
          );
      if (!mounted) return;
      setState(() {
        _enrollment = null;
        _enrollmentCodeController.clear();
      });
      _setNotice('Two-factor authentication is now active on this account.');
      await _loadFactors();
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Second-factor challenge used when the account already has a verified
  /// factor and the session is still aal1.
  Future<void> _verifyPendingFactor() async {
    final code = _codeController.text.trim();
    if (code.length < 6) {
      _setNotice('Enter the 6-digit code from your authenticator app.', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AuthController>().submitSecondFactor(code);
      if (!mounted) return;
      _codeController.clear();
      _setNotice('Two-factor confirmation completed for this session.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeFactor(MfaFactor factor) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove two-factor authentication?'),
        content: const Text(
            'Sign-in will only require your password afterwards. You can enrol an authenticator again at any time.'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<AuthController>().removeFactor(factor.id);
      if (!mounted) return;
      _setNotice('Authenticator removed.');
      await _loadFactors();
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Security')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
        children: <Widget>[
          if (_notice != null) ...<Widget>[
            InfoBanner(
              message: _notice!,
              tone: _noticeIsError ? InfoTone.danger : InfoTone.info,
            ),
            const SizedBox(height: 16),
          ],
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: BrandColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: BrandColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text('Signed in as',
                    style: TextStyle(color: BrandColors.muted, fontSize: 12.5)),
                Text(auth.email ?? '—',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 6),
                Text(
                  auth.isSignedIn
                      ? 'Session assurance: ${auth.factors.isNotEmpty ? 'second factor enrolled' : 'password only'}'
                      : 'No active session',
                  style: const TextStyle(color: BrandColors.muted, fontSize: 12.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const SectionHeader(title: 'Password'),
          TextField(
            controller: _passwordController,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New password'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirmController,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Confirm new password'),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _changePassword,
            child: const Text('Update password'),
          ),
          const SizedBox(height: 20),
          const SectionHeader(title: 'Two-factor authentication'),
          if (_loadingFactors)
            const LoadingView(label: 'Checking enrolled factors')
          else if (_factors.where((factor) => factor.isVerified).isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: BrandColors.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: BrandColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const Text(
                    'No authenticator app is enrolled. Add one and Jobiest will require a 6-digit code at '
                    'sign-in — the same provider-backed TOTP used by the website.',
                    style: TextStyle(color: BrandColors.muted, height: 1.45),
                  ),
                  const SizedBox(height: 14),
                  if (_enrollment == null) ...<Widget>[
                    FilledButton(
                      onPressed: _busy ? null : _beginEnrollment,
                      child: const Text('Set up an authenticator app'),
                    ),
                  ] else ...<Widget>[
                    const Text('1. Enter this key in your authenticator app:',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: BrandColors.brandSoft,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: BrandColors.brandLine),
                      ),
                      child: Row(
                        children: <Widget>[
                          Expanded(
                            child: SelectableText(
                              _enrollment!.secret,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Copy key',
                            onPressed: () async {
                              await Clipboard.setData(
                                  ClipboardData(text: _enrollment!.secret));
                              if (mounted) {
                                showAppMessage(context, 'Key copied to the clipboard.');
                              }
                            },
                            icon: const Icon(Icons.copy, size: 18),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text('2. Confirm with the code it generates:',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _enrollmentCodeController,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      decoration: const InputDecoration(labelText: '6-digit code', counterText: ''),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _busy ? null : _confirmEnrollment,
                      child: const Text('Confirm and enable'),
                    ),
                  ],
                ],
              ),
            )
          else ...<Widget>[
            ..._factors.where((factor) => factor.isVerified).map(
                  (factor) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: BrandColors.card,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: BrandColors.line),
                    ),
                    child: ListTile(
                      leading: const Icon(Icons.verified_user_outlined),
                      title: Text(factor.friendlyName),
                      subtitle: Text('TOTP · ${factor.status}'),
                      trailing: TextButton(
                        onPressed: _busy ? null : () => _removeFactor(factor),
                        child: const Text('Remove'),
                      ),
                    ),
                  ),
                ),
            const SizedBox(height: 10),
            const Text(
              'A code is required when your session has not completed the second factor.',
              style: TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.45),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _codeController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(
                labelText: 'Confirm a code now (optional)',
                counterText: '',
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy ? null : _verifyPendingFactor,
              child: const Text('Verify code'),
            ),
          ],
          const SizedBox(height: 18),
          const InfoBanner(
            message:
                'Jobiest uses the provider\u2019s supported TOTP implementation. No custom cryptography is '
                'involved, and recovery codes are managed by the provider on jobiest.com.',
          ),
        ],
      ),
    );
  }
}
