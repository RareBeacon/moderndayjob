import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../../models/account.dart';
import 'data/profile_repository.dart';

/// Job-search preferences stored by `PUT /api/preferences`. These are the
/// inputs the backend's matching engine uses when the agent scores roles.
class PreferencesScreen extends StatefulWidget {
  const PreferencesScreen({super.key});

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  final _locationsController = TextEditingController();
  final _salaryController = TextEditingController();

  static const List<String> _remoteOptions = <String>['remote', 'hybrid', 'onsite'];
  static const List<String> _employmentOptions = <String>[
    'full-time',
    'part-time',
    'contract',
    'internship',
  ];

  final Set<String> _remoteTypes = <String>{};
  final Set<String> _employmentTypes = <String>{};
  String _currency = 'USD';

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
    _locationsController.dispose();
    _salaryController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final preferences = await context.read<ProfileRepository>().preferences();
      if (!mounted) return;
      setState(() {
        _remoteTypes
          ..clear()
          ..addAll(preferences.remoteTypes);
        _employmentTypes
          ..clear()
          ..addAll(preferences.employmentTypes);
        _locationsController.text = preferences.locations.join(', ');
        _salaryController.text = preferences.salaryMin?.toString() ?? '';
        if (preferences.currency != null && preferences.currency!.isNotEmpty) {
          _currency = preferences.currency!;
        }
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

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      await context.read<ProfileRepository>().savePreferences(
            remoteTypes: _remoteTypes.toList(),
            locations: _locationsController.text
                .split(',')
                .map((value) => value.trim())
                .where((value) => value.isNotEmpty)
                .toList(),
            employmentTypes: _employmentTypes.toList(),
            salaryMin: int.tryParse(_salaryController.text.trim()),
            currency: _currency,
          );
      if (!mounted) return;
      setState(() => _notice = 'Preferences saved.');
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
      appBar: AppBar(title: const Text('Job preferences')),
      body: _loading
          ? const LoadingView(label: 'Loading preferences')
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      if (_notice != null) ...<Widget>[
                        InfoBanner(message: _notice!),
                        const SizedBox(height: 16),
                      ],
                      const SectionHeader(title: 'Work arrangement'),
                      Wrap(
                        spacing: 8,
                        children: _remoteOptions
                            .map((option) => FilterChip(
                                  label: Text(option),
                                  selected: _remoteTypes.contains(option),
                                  onSelected: (selected) => setState(() {
                                    if (selected) {
                                      _remoteTypes.add(option);
                                    } else {
                                      _remoteTypes.remove(option);
                                    }
                                  }),
                                ))
                            .toList(),
                      ),
                      const SizedBox(height: 18),
                      const SectionHeader(title: 'Employment type'),
                      Wrap(
                        spacing: 8,
                        children: _employmentOptions
                            .map((option) => FilterChip(
                                  label: Text(option),
                                  selected: _employmentTypes.contains(option),
                                  onSelected: (selected) => setState(() {
                                    if (selected) {
                                      _employmentTypes.add(option);
                                    } else {
                                      _employmentTypes.remove(option);
                                    }
                                  }),
                                ))
                            .toList(),
                      ),
                      const SizedBox(height: 18),
                      TextField(
                        controller: _locationsController,
                        decoration: const InputDecoration(
                          labelText: 'Locations',
                          helperText: 'Comma separated, e.g. Lagos, Remote (EU)',
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _salaryController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Minimum salary (optional)',
                        ),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        value: _currency,
                        decoration: const InputDecoration(labelText: 'Currency'),
                        items: const <DropdownMenuItem<String>>[
                          DropdownMenuItem(value: 'USD', child: Text('USD')),
                          DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                          DropdownMenuItem(value: 'GBP', child: Text('GBP')),
                          DropdownMenuItem(value: 'NGN', child: Text('NGN')),
                        ],
                        onChanged: (value) => setState(() => _currency = value ?? 'USD'),
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
                            : const Text('Save preferences'),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'The agent filters listings with these preferences before scoring them, which is why '
                        'results can be narrower than the full job pool.',
                        style: TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.45),
                      ),
                    ],
                  ),
                ),
    );
  }
}
