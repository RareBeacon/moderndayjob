import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/formatters.dart';
import '../../core/widgets/state_views.dart';
import '../../models/account.dart';
import '../../models/json.dart';
import '../agent/data/agent_repository.dart';
import '../profile/data/profile_repository.dart';
import '../resume/data/resume_repository.dart';

/// Career Score. Two real, server-computed signals are shown side by side:
/// the profile-completeness score (`/api/profile/completeness`) and the
/// deterministic resume structure scan (`/api/ats/scan`). Nothing is invented
/// when a signal is unavailable.
class CareerScoreScreen extends StatefulWidget {
  const CareerScoreScreen({super.key});

  @override
  State<CareerScoreScreen> createState() => _CareerScoreScreenState();
}

class _CareerScoreScreenState extends State<CareerScoreScreen> {
  final _resumeController = TextEditingController();
  final _jobDescriptionController = TextEditingController();

  bool _loading = true;
  String? _loadError;
  ProfileCompleteness? _completeness;
  Entitlements? _entitlements;

  bool _scanning = false;
  Map<String, dynamic>? _scan;
  String? _scanError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _resumeController.dispose();
    _jobDescriptionController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final profile = context.read<ProfileRepository>();
      final resume = context.read<ResumeRepository>();
      final completeness = await profile.completeness();
      Entitlements? entitlements;
      try {
        entitlements = await profile.entitlements();
      } on ApiException {
        entitlements = null;
      }
      // Prefill the resume text from the stored draft so the scan runs on real
      // data rather than an empty box.
      try {
        final draft = await resume.loadDraft();
        if (draft != null) {
          _resumeController.text = <String>[
            draft.fullName,
            draft.headline,
            draft.summary,
            draft.skills,
          ].where((part) => part.trim().isNotEmpty).join('\n\n');
          _jobDescriptionController.text = draft.targetJobDescription;
        }
      } on ApiException {
        // optional
      }
      if (!mounted) return;
      setState(() {
        _completeness = completeness;
        _entitlements = entitlements;
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

  Future<void> _runScan() async {
    final text = _resumeController.text.trim();
    if (text.length < 100) {
      setState(() => _scanError =
          'Paste at least 100 characters of resume text so the scan has something to check.');
      return;
    }
    setState(() {
      _scanning = true;
      _scanError = null;
    });
    try {
      final scan = await context.read<AgentRepository>().atsScan(
            resumeText: text,
            jobDescription: _jobDescriptionController.text.trim(),
          );
      if (!mounted) return;
      setState(() => _scan = scan);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _scanError = error.message);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: LoadingView(label: 'Reading your scores'));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Career Score')),
      body: _loadError != null
          ? ErrorView(message: _loadError!, onRetry: _load)
          : ListView(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
              children: <Widget>[
                const SectionHeader(title: 'Profile readiness'),
                _ScoreCard(
                  score: _completeness?.percent,
                  caption:
                      'Computed by the backend from the profile fields you have stored: name, roles, '
                      'headline, summary, skills, experience, education, portfolio link and an uploaded CV.',
                  missing: _completeness?.next ?? const <String>[],
                ),
                const SizedBox(height: 20),
                const SectionHeader(title: 'Plan and limits'),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: BrandColors.card,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: BrandColors.line),
                  ),
                  child: _entitlements == null
                      ? const Text('Plan information is not available for this account.',
                          style: TextStyle(color: BrandColors.muted))
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text('${_entitlements!.planLabel} plan',
                                style: const TextStyle(
                                    fontSize: 17, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 8),
                            if (_entitlements!.aiCreditsRemaining != null)
                              _Line('AI credits left today',
                                  '${_entitlements!.aiCreditsRemaining}'),
                            if (_entitlements!.applicationsRemaining != null)
                              _Line('Application credits left',
                                  '${_entitlements!.applicationsRemaining}'),
                            if (_entitlements!.toolsRemaining != null)
                              _Line('Tool credits left', '${_entitlements!.toolsRemaining}'),
                            _Line('Automated submission',
                                _entitlements!.automationEnabled ? 'Enabled' : 'Not included'),
                            if (_entitlements!.onTrial && _entitlements!.trialEndsAt != null)
                              _Line('Trial ends', shortDate(_entitlements!.trialEndsAt!)),
                          ],
                        ),
                ),
                const SizedBox(height: 20),
                const SectionHeader(title: 'Resume structure scan'),
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
                        'A deterministic ATS-style check of structure and parseability. It does not judge '
                        'you as a candidate and it uses no AI credits.',
                        style: TextStyle(color: BrandColors.muted, height: 1.45),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _resumeController,
                        minLines: 5,
                        maxLines: 9,
                        decoration: const InputDecoration(
                          labelText: 'Resume text',
                          alignLabelWithHint: true,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _jobDescriptionController,
                        minLines: 2,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Target job description (optional)',
                          alignLabelWithHint: true,
                        ),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _scanning ? null : _runScan,
                        child: _scanning
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2.2, color: Colors.white))
                            : const Text('Run scan'),
                      ),
                      if (_scanError != null) ...<Widget>[
                        const SizedBox(height: 12),
                        InfoBanner(message: _scanError!, tone: InfoTone.danger),
                      ],
                      if (_scan != null) ...<Widget>[
                        const SizedBox(height: 16),
                        _ScanReport(scan: _scan!),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                const InfoBanner(
                  message:
                      'Career Score shows what the backend actually measures. Certifications, badges and '
                      'predicted outcomes are not displayed because Jobiest does not compute them.',
                ),
              ],
            ),
    );
  }
}

class _ScoreCard extends StatelessWidget {
  const _ScoreCard({required this.score, required this.caption, required this.missing});

  final int? score;
  final String caption;
  final List<String> missing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: BrandColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BrandColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Text(
                score == null ? '—' : '$score',
                style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800, height: 1),
              ),
              const Padding(
                padding: EdgeInsets.only(left: 6, bottom: 4),
                child: Text('/ 100', style: TextStyle(color: BrandColors.muted)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (score ?? 0) / 100,
              minHeight: 8,
              backgroundColor: BrandColors.brandSoft,
            ),
          ),
          const SizedBox(height: 12),
          Text(caption, style: const TextStyle(color: BrandColors.muted, height: 1.45)),
          if (missing.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            const Text('Next steps the backend suggests:',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            ...missing.take(5).map(
                  (step) => Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('• $step', style: const TextStyle(height: 1.4)),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class _ScanReport extends StatelessWidget {
  const _ScanReport({required this.scan});

  final Map<String, dynamic> scan;

  @override
  Widget build(BuildContext context) {
    final score = scan['score'];
    final findings = scan['findings'];
    final stats = asMap(scan['stats']);
    final keywords = asMap(scan['keywords']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            Text(
              score is num ? '${score.toInt()}' : '—',
              style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, height: 1),
            ),
            const Padding(
              padding: EdgeInsets.only(left: 6, bottom: 3),
              child: Text('/ 100 structure', style: TextStyle(color: BrandColors.muted)),
            ),
          ],
        ),
        if (stats.isNotEmpty) ...<Widget>[
          const SizedBox(height: 6),
          Text(
            'Words: ${stats['words'] ?? '—'} · Bullets: ${stats['bullets'] ?? '—'}',
            style: const TextStyle(color: BrandColors.muted, fontSize: 12.5),
          ),
        ],
        if (findings is List) ...<Widget>[
          const SizedBox(height: 12),
          ...findings.whereType<Map<String, dynamic>>().map((finding) {
            final status = (finding['status'] ?? '').toString();
            final icon = status == 'pass'
                ? Icons.check_circle_outline
                : status == 'warn'
                    ? Icons.warning_amber_outlined
                    : Icons.error_outline;
            final color = status == 'pass'
                ? BrandColors.success
                : status == 'warn'
                    ? BrandColors.warning
                    : BrandColors.danger;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(icon, size: 18, color: color),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(asStringOr(finding['check'], 'Check'),
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                        if (asString(finding['detail']) != null)
                          Text(asString(finding['detail'])!,
                              style: const TextStyle(color: BrandColors.muted, height: 1.4, fontSize: 13)),
                        if (asString(finding['tip']) != null)
                          Text(asString(finding['tip'])!,
                              style: const TextStyle(color: BrandColors.brandStrong, fontSize: 12.5)),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
        if (keywords.isNotEmpty) ...<Widget>[
          const SizedBox(height: 6),
          if (asStringList(keywords['matched']).isNotEmpty)
            Text('Keywords matched: ${asStringList(keywords['matched']).join(', ')}',
                style: const TextStyle(color: BrandColors.success, fontSize: 12.5)),
          if (asStringList(keywords['missing']).isNotEmpty)
            Text('Keywords missing: ${asStringList(keywords['missing']).join(', ')}',
                style: const TextStyle(color: BrandColors.warning, fontSize: 12.5)),
        ],
        if (asString(scan['note']) != null) ...<Widget>[
          const SizedBox(height: 10),
          Text(asString(scan['note'])!,
              style: const TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.4)),
        ],
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(label, style: const TextStyle(color: BrandColors.muted, fontSize: 13.5)),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
