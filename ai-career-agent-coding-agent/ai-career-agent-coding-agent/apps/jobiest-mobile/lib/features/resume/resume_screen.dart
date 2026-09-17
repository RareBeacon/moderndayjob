import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../../models/resume.dart';
import '../profile/data/profile_repository.dart';
import 'data/resume_repository.dart';

/// Resume Studio: edits the server-side draft that the web app's Resume Studio
/// also uses. Saving goes through `PUT /api/resume-studio/draft`; the assistant
/// suggestions come from `POST /api/resume-studio/ai`.
class ResumeScreen extends StatefulWidget {
  const ResumeScreen({super.key});

  @override
  State<ResumeScreen> createState() => _ResumeScreenState();
}

class _ResumeScreenState extends State<ResumeScreen> {
  final _nameController = TextEditingController();
  final _headlineController = TextEditingController();
  final _summaryController = TextEditingController();
  final _skillsController = TextEditingController();
  final _targetRoleController = TextEditingController();
  final _jobDescriptionController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  bool _assisting = false;
  String? _loadError;
  String? _notice;
  bool _noticeIsError = false;
  ResumeDraft? _draft;
  List<String> _serverSuggestions = <String>[];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _headlineController.dispose();
    _summaryController.dispose();
    _skillsController.dispose();
    _targetRoleController.dispose();
    _jobDescriptionController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    final resumeRepository = context.read<ResumeRepository>();
    final profileRepository = context.read<ProfileRepository>();
    try {
      final draft = await resumeRepository.loadDraft();
      if (!mounted) return;
      // Fall back to the stored profile for the name so the first draft is not
      // empty. Every value still comes from the backend.
      var fullName = draft?.fullName ?? '';
      if (fullName.isEmpty) {
        try {
          final account = await profileRepository.account();
          fullName = account.profile.fullName ?? '';
          if (_targetRoleController.text.isEmpty &&
              account.profile.targetRoles.isNotEmpty) {
            _targetRoleController.text = account.profile.targetRoles.first;
          }
        } on ApiException {
          // optional
        }
      }
      if (!mounted) return;
      setState(() {
        _draft = draft;
        _nameController.text = fullName;
        _headlineController.text = draft?.headline ?? '';
        _summaryController.text = draft?.summary ?? '';
        _skillsController.text = draft?.skills ?? '';
        _jobDescriptionController.text = draft?.targetJobDescription ?? '';
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loadError = error.message;
        _loading = false;
      });
    }
  }

  ResumeDraft _currentDraft() {
    final existing = _draft;
    final content = <String, dynamic>{
      ...?existing?.content,
      'fullName': _nameController.text.trim(),
      'headline': _headlineController.text.trim(),
      'summary': _summaryController.text.trim(),
      'skills': _skillsController.text.trim(),
      'targetRoles': _targetRoleController.text.trim(),
    };
    return ResumeDraft(
      id: existing?.id,
      name: existing?.name ?? (_nameController.text.trim().isEmpty
          ? 'My resume'
          : '${_nameController.text.trim()} — resume'),
      selectedTemplate: existing?.selectedTemplate,
      currentStep: existing?.currentStep,
      targetJobDescription: _jobDescriptionController.text.trim(),
      content: content,
      score: existing?.score ?? const <String, dynamic>{},
      completion: existing?.completion ?? 0,
      updatedAt: existing?.updatedAt,
    );
  }

  Future<void> _save() async {
    if (_nameController.text.trim().length < 2) {
      _setNotice('Add your name (2+ characters) before saving.', error: true);
      return;
    }
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      final saved = await context.read<ResumeRepository>().saveDraft(_currentDraft());
      if (!mounted) return;
      setState(() => _draft = saved ?? _draft);
      _setNotice('Draft saved to your Jobiest account.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _askAssistant(String action) async {
    setState(() {
      _assisting = true;
      _notice = null;
    });
    try {
      final response = await context.read<ResumeRepository>().assist(
            action: action,
            draft: _currentDraft().content,
            role: _targetRoleController.text.trim(),
            jobDescription: _jobDescriptionController.text.trim(),
            text: _summaryController.text.trim(),
          );
      if (!mounted) return;
      final lines = _humanLines(response);
      setState(() => _serverSuggestions = lines);
      _setNotice(lines.isEmpty
          ? 'The assistant returned nothing for that request.'
          : 'Assistant suggestions below come straight from the backend.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _assisting = false);
    }
  }

  List<String> _humanLines(Map<String, dynamic> response) {
    final lines = <String>[];
    void walk(Object? value, [String? key]) {
      if (value is String && value.trim().isNotEmpty) {
        lines.add(key == null ? value.trim() : '$key: ${value.trim()}');
      } else if (value is num || value is bool) {
        if (key != null) lines.add('$key: $value');
      } else if (value is List) {
        for (final item in value) {
          walk(item, key);
        }
      } else if (value is Map<String, dynamic>) {
        value.forEach((childKey, childValue) => walk(childValue, childKey));
      }
    }

    response.forEach((key, value) {
      if (key == 'provider') return;
      walk(value, key);
    });
    return lines.take(20).toList();
  }

  void _setNotice(String message, {bool error = false}) {
    setState(() {
      _notice = message;
      _noticeIsError = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Resume Studio'),
        actions: <Widget>[
          TextButton(
            onPressed: _saving || _loading ? null : _save,
            child: Text(
              _saving ? 'Saving…' : 'Save',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
      body: _loading
          ? const LoadingView(label: 'Opening your draft')
          : _loadError != null
              ? ErrorView(message: _loadError!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
                  children: <Widget>[
                    if (_notice != null) ...<Widget>[
                      InfoBanner(
                        message: _notice!,
                        tone: _noticeIsError ? InfoTone.danger : InfoTone.info,
                      ),
                      const SizedBox(height: 14),
                    ],
                    if (_draft == null)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 14),
                        child: InfoBanner(
                          message:
                              'No saved draft yet — fill this in and save; it will appear in Resume Studio '
                              'on the website too.',
                        ),
                      ),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: _Stat(
                            label: 'Completion',
                            value: '${_draft?.completion ?? 0}%',
                          ),
                        ),
                        Expanded(
                          child: _Stat(
                            label: 'Stored score',
                            value: _draft?.overallScore?.toString() ?? '—',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _field(_nameController, 'Full name'),
                    _field(_headlineController, 'Headline'),
                    _field(_summaryController, 'Professional summary', maxLines: 6),
                    _field(_skillsController, 'Skills (comma separated)'),
                    _field(_targetRoleController, 'Target role'),
                    _field(_jobDescriptionController, 'Target job description',
                        maxLines: 5,
                        helper:
                            'Paste a job description to tailor suggestions and the ATS scan.'),
                    const SizedBox(height: 6),
                    const SectionHeader(title: 'Assistant'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        _assistantChip('Suggest skills', 'suggestSkills'),
                        _assistantChip('Write summary', 'writeSummary'),
                        _assistantChip('Analyse draft', 'analyzeResume'),
                        _assistantChip('Final review', 'finalReview'),
                        _assistantChip('Optimise for job', 'optimizeForJob'),
                      ],
                    ),
                    if (_assisting)
                      const Padding(
                        padding: EdgeInsets.only(top: 14),
                        child: LoadingView(label: 'Asking the assistant'),
                      ),
                    for (final suggestion in _serverSuggestions)
                      Container(
                        margin: const EdgeInsets.only(top: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: BrandColors.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: BrandColors.line),
                        ),
                        child: Text(suggestion, style: const TextStyle(height: 1.45)),
                      ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      child: Text(_saving ? 'Saving…' : 'Save draft'),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Saving writes to the same Resume Studio draft the website uses. Generation and PDF '
                      'export stay on the web workflow for now — this screen is for editing and saving.',
                      style: TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.45),
                    ),
                  ],
                ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    int maxLines = 1,
    String? helper,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: controller,
        minLines: maxLines == 1 ? 1 : maxLines ~/ 2,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label, helperText: helper),
      ),
    );
  }

  Widget _assistantChip(String label, String action) {
    return ActionChip(
      label: Text(label),
      onPressed: _assisting ? null : () => _askAssistant(action),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        Text(label, style: const TextStyle(color: BrandColors.muted, fontSize: 12.5)),
      ],
    );
  }
}
