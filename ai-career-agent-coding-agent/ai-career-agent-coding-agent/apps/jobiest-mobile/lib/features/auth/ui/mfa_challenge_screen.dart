import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/state_views.dart';
import '../state/auth_controller.dart';

/// Second-factor challenge for accounts that have an authenticator enrolled.
/// The gate itself is the provider's: the access token carries `aal1`, and the
/// backend rejects data requests until it is `aal2` (see `lib/auth.ts`).
class MfaChallengeScreen extends StatefulWidget {
  const MfaChallengeScreen({super.key});

  @override
  State<MfaChallengeScreen> createState() => _MfaChallengeScreenState();
}

class _MfaChallengeScreenState extends State<MfaChallengeScreen> {
  final _codeController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _codeController.text.trim();
    if (code.length < 6) {
      setState(() => _error = 'Enter the 6-digit code from your authenticator app');
      return;
    }
    setState(() => _error = null);
    final auth = context.read<AuthController>();
    try {
      await auth.submitSecondFactor(code);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    return Scaffold(
      backgroundColor: BrandColors.ink,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: BrandColors.card,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const Icon(Icons.shield_outlined, size: 32, color: BrandColors.brandStrong),
                  const SizedBox(height: 12),
                  const Text(
                    'Two-factor authentication',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Signed in as ${auth.email ?? ''}. Enter the current code from your authenticator app.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: BrandColors.muted, height: 1.45),
                  ),
                  const SizedBox(height: 18),
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 22, letterSpacing: 8),
                    decoration: const InputDecoration(counterText: '', hintText: '000000'),
                    onSubmitted: (_) => _submit(),
                  ),
                  if (_error != null) ...<Widget>[
                    const SizedBox(height: 8),
                    InfoBanner(message: _error!, tone: InfoTone.danger),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: auth.busy ? null : _submit,
                    child: auth.busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child:
                                CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                          )
                        : const Text('Verify and continue'),
                  ),
                  const SizedBox(height: 6),
                  TextButton(
                    onPressed: () => auth.signOut(),
                    child: const Text('Cancel and sign out'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
