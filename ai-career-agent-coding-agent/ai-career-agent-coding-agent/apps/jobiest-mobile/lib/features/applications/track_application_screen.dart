import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/widgets/state_views.dart';
import 'data/applications_repository.dart';

/// Records an application the user submitted elsewhere. It uses the backend's
/// real `mode: manual` workflow, so the record is stored server-side under the
/// user's account — the app never keeps a private list.
class TrackApplicationScreen extends StatefulWidget {
  const TrackApplicationScreen({super.key});

  @override
  State<TrackApplicationScreen> createState() => _TrackApplicationScreenState();
}

class _TrackApplicationScreenState extends State<TrackApplicationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _companyController = TextEditingController();
  final _titleController = TextEditingController();
  final _urlController = TextEditingController();
  String _status = 'SUBMITTED';
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _companyController.dispose();
    _titleController.dispose();
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<ApplicationsRepository>().trackManual(
            company: _companyController.text.trim(),
            title: _titleController.text.trim(),
            url: _urlController.text.trim(),
            status: _status,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Track an application')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const Text(
                'Use this for roles you applied to outside Jobiest. The record is stored in your '
                'Jobiest account so Applications stays your single source of truth.',
                style: TextStyle(height: 1.45),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _companyController,
                decoration: const InputDecoration(labelText: 'Company'),
                validator: (value) => (value ?? '').trim().length < 2
                    ? 'Enter the company name (2+ characters)'
                    : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: 'Role title'),
                validator: (value) =>
                    (value ?? '').trim().length < 2 ? 'Enter the role title' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _urlController,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'Job posting URL',
                  hintText: 'https://…',
                ),
                validator: (value) {
                  final text = (value ?? '').trim();
                  final uri = Uri.tryParse(text);
                  if (text.isEmpty || uri == null || !uri.hasScheme) {
                    return 'Enter the full posting URL';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: _status,
                decoration: const InputDecoration(labelText: 'Current status'),
                items: const <DropdownMenuItem<String>>[
                  DropdownMenuItem(value: 'DRAFT', child: Text('Draft — not sent yet')),
                  DropdownMenuItem(value: 'SUBMITTED', child: Text('Submitted')),
                  DropdownMenuItem(value: 'INTERVIEW', child: Text('Interview')),
                  DropdownMenuItem(value: 'REJECTED', child: Text('Rejected')),
                  DropdownMenuItem(value: 'WITHDRAWN', child: Text('Withdrawn')),
                ],
                onChanged: (value) => setState(() => _status = value ?? 'SUBMITTED'),
              ),
              if (_error != null) ...<Widget>[
                const SizedBox(height: 16),
                InfoBanner(message: _error!, tone: InfoTone.danger),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                    : const Text('Save application'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
