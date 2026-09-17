import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../auth/state/auth_controller.dart';
import 'data/support_repository.dart';

/// Real support intake: stores the message server-side and delivers it to the
/// support inbox when one is configured. The result text comes from the
/// backend, so a failure never shows up as a fake "message sent".
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();

  String _category = supportCategories.first;
  bool _busy = false;
  String? _error;
  SupportResult? _result;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final email = context.read<AuthController>().email;
      if (email != null && email.isNotEmpty) _emailController.text = email;
    });
  }

  @override
  void dispose() {
    _emailController.dispose();
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await context.read<SupportRepository>().send(
            email: _emailController.text.trim(),
            category: _category,
            subject: _subjectController.text.trim(),
            message: _messageController.text.trim(),
          );
      if (!mounted) return;
      setState(() => _result = result);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = context.read<AppConfig>();
    final mailto = Uri(
      scheme: 'mailto',
      path: config.supportEmail,
      query: 'subject=${Uri.encodeComponent(_subjectController.text.isEmpty ? 'Jobiest support' : _subjectController.text)}',
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Support')),
      body: _result != null
          ? SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  InfoBanner(
                    tone: _result!.delivered ? InfoTone.success : InfoTone.warning,
                    message: _result!.message,
                  ),
                  const SizedBox(height: 16),
                  if (!_result!.delivered)
                    const InfoBanner(
                      message:
                          'The support inbox is not connected on this deployment, so the message was stored '
                          'but not emailed. Writing directly is the fastest route.',
                    ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: () => launchUrl(mailto),
                    icon: const Icon(Icons.mail_outline, size: 18),
                    label: Text('Email ${config.supportEmail}'),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: () => setState(() => _result = null),
                    child: const Text('Send another message'),
                  ),
                ],
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    const Text(
                      'Tell us what happened and we will get back to you by email.',
                      style: TextStyle(height: 1.45),
                    ),
                    const SizedBox(height: 18),
                    DropdownButtonFormField<String>(
                      value: _category,
                      decoration: const InputDecoration(labelText: 'Category'),
                      items: supportCategories
                          .map((category) => DropdownMenuItem<String>(
                                value: category,
                                child: Text(category),
                              ))
                          .toList(),
                      onChanged: (value) =>
                          setState(() => _category = value ?? supportCategories.first),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Your email'),
                      validator: (value) {
                        final text = (value ?? '').trim();
                        if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(text)) {
                          return 'Enter an email address we can reply to';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _subjectController,
                      decoration: const InputDecoration(labelText: 'Subject'),
                      validator: (value) =>
                          (value ?? '').trim().length < 3 ? 'Add a short subject' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _messageController,
                      minLines: 5,
                      maxLines: 10,
                      decoration: const InputDecoration(
                        labelText: 'Message',
                        alignLabelWithHint: true,
                        helperText: 'At least 10 characters',
                      ),
                      validator: (value) =>
                          (value ?? '').trim().length < 10 ? 'Add a little more detail' : null,
                    ),
                    if (_error != null) ...<Widget>[
                      const SizedBox(height: 14),
                      InfoBanner(message: _error!, tone: InfoTone.danger),
                    ],
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.2, color: Colors.white))
                          : const Text('Send message'),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => launchUrl(mailto),
                      icon: const Icon(Icons.mail_outline, size: 18),
                      label: Text('Email ${config.supportEmail} instead'),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      '${config.supportEmail} is the verified support address. '
                      'Transactional email (welcome messages, sign-in mail) comes from no-reply@jobiest.com.',
                      style: const TextStyle(color: BrandColors.muted, fontSize: 12, height: 1.4),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
