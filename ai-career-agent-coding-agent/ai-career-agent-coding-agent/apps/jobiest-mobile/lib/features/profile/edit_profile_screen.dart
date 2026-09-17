import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/widgets/state_views.dart';
import 'data/profile_repository.dart';

/// Edits the same profile fields the website does. The save goes through
/// `PUT /api/profile`, whose schema requires a name (2+ characters), at least
/// one target role and at most six.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _rolesController = TextEditingController();
  final _applicationEmailController = TextEditingController();
  final _headlineController = TextEditingController();
  final _summaryController = TextEditingController();
  final _skillsController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _rolesController.dispose();
    _applicationEmailController.dispose();
    _headlineController.dispose();
    _summaryController.dispose();
    _skillsController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final account = await context.read<ProfileRepository>().account();
      if (!mounted) return;
      setState(() {
        _nameController.text = account.profile.fullName ?? '';
        _rolesController.text = account.profile.targetRoles.join(', ');
        _applicationEmailController.text = account.profile.applicationEmail ?? '';
        _headlineController.text = account.career.headline ?? '';
        _summaryController.text = account.career.summary ?? '';
        _skillsController.text = account.career.skills.join(', ');
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

  List<String> _splitList(String value) => value
      .split(',')
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      await context.read<ProfileRepository>().saveProfile(
            fullName: _nameController.text,
            targetRoles: _splitList(_rolesController.text),
            applicationEmail: _applicationEmailController.text,
            headline: _headlineController.text,
            summary: _summaryController.text,
            skills: _splitList(_skillsController.text),
          );
      if (!mounted) return;
      setState(() => _notice = 'Profile saved.');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _notice = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: _loading
          ? const LoadingView(label: 'Loading your profile')
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        if (_notice != null) ...<Widget>[
                          InfoBanner(message: _notice!),
                          const SizedBox(height: 16),
                        ],
                        TextFormField(
                          controller: _nameController,
                          decoration: const InputDecoration(labelText: 'Full name'),
                          validator: (value) => (value ?? '').trim().length < 2
                              ? 'Enter your name (2+ characters)'
                              : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _rolesController,
                          decoration: const InputDecoration(
                            labelText: 'Target roles',
                            helperText: 'Comma separated, 1–6 roles',
                          ),
                          validator: (value) {
                            final roles = _splitList(value ?? '');
                            if (roles.isEmpty) return 'Add at least one target role';
                            if (roles.length > 6) return 'Keep it to six roles or fewer';
                            return null;
                          },
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _applicationEmailController,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Application email (optional)',
                            helperText: 'Contact address used on applications; never used for inbox access',
                          ),
                          validator: (value) {
                            final text = (value ?? '').trim();
                            if (text.isEmpty) return null;
                            if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(text)) {
                              return 'That email address does not look right';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _headlineController,
                          decoration: const InputDecoration(labelText: 'Headline'),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _summaryController,
                          minLines: 4,
                          maxLines: 8,
                          decoration: const InputDecoration(
                            labelText: 'Professional summary',
                            alignLabelWithHint: true,
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _skillsController,
                          decoration: const InputDecoration(
                            labelText: 'Skills',
                            helperText: 'Comma separated, up to 40',
                          ),
                        ),
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: _saving ? null : _save,
                          child: _saving
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2.2, color: Colors.white))
                              : const Text('Save profile'),
                        ),
                        const SizedBox(height: 10),
                        const Text(
                          'Experience and education entries are edited on the website for now; this screen '
                          'updates name, roles, contact email, headline, summary and skills without touching '
                          'the rest of your record.',
                          style: TextStyle(color: Colors.black54, fontSize: 12.5, height: 1.45),
                        ),
                      ],
                    ),
                  ),
                ),
    );
  }
}
