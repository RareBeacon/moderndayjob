import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/formatters.dart';
import '../../core/widgets/state_views.dart';
import '../../models/application.dart';
import '../../models/json.dart';
import 'applications_screen.dart';
import 'data/applications_repository.dart';

class ApplicationDetailScreen extends StatefulWidget {
  const ApplicationDetailScreen({super.key, required this.application});

  final JobApplication application;

  @override
  State<ApplicationDetailScreen> createState() => _ApplicationDetailScreenState();
}

class _ApplicationDetailScreenState extends State<ApplicationDetailScreen> {
  late JobApplication _application = widget.application;
  Map<String, dynamic>? _detail;
  bool _loadingDetail = true;
  bool _busy = false;
  String? _detailError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadDetail());
  }

  Future<void> _loadDetail() async {
    setState(() {
      _loadingDetail = true;
      _detailError = null;
    });
    try {
      final detail =
          await context.read<ApplicationsRepository>().detail(widget.application.id);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loadingDetail = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _detailError = error.message;
        _loadingDetail = false;
      });
    }
  }

  Future<void> _openJobLink() async {
    final jobFromDetail = _detail == null ? null : _detail!['job'];
    final url = _application.job?.url ??
        (jobFromDetail is Map<String, dynamic> ? asString(jobFromDetail['url']) : null);
    if (url == null || url.isEmpty) {
      showAppMessage(context, 'This application has no job link stored.', error: true);
      return;
    }
    final opened = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      showAppMessage(context, 'No browser could open that link.', error: true);
    }
  }

  Future<void> _withdraw() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Withdraw this application?'),
        content: const Text(
            'The application moves to Withdrawn and stops any further processing. This cannot be undone.'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await context.read<ApplicationsRepository>().withdraw(_application.id);
      if (!mounted) return;
      setState(() {
        _application = JobApplication(
          id: _application.id,
          status: 'WITHDRAWN',
          jobId: _application.jobId,
          email: _application.email,
          submittedAt: _application.submittedAt,
          createdAt: _application.createdAt,
          job: _application.job,
        );
      });
      showAppMessage(context, 'Application withdrawn.');
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppMessage(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = _application.job;
    final jobMap = _detail == null ? null : _detail!['job'];
    final storedJob = jobMap is Map<String, dynamic> ? jobMap : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Application')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  _application.title,
                  style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
                ),
              ),
              ApplicationStatusChip(status: _application.status),
            ],
          ),
          const SizedBox(height: 6),
          Text(_application.company,
              style: const TextStyle(
                  fontSize: 15, color: BrandColors.brandStrong, fontWeight: FontWeight.w600)),
          if (job?.location != null)
            Text(job!.location!, style: const TextStyle(color: BrandColors.muted)),
          const SizedBox(height: 18),
          const SectionHeader(title: 'Timeline'),
          _DetailTile(label: 'Tracked', value: shortDate(_application.createdAt)),
          _DetailTile(label: 'Submitted', value: shortDate(_application.submittedAt)),
          _DetailTile(label: 'Application email', value: _application.email ?? '—'),
          if (_application.error != null)
            _DetailTile(label: 'Last error', value: _application.error!),
          if (storedJob != null && asString(storedJob['url']) != null)
            _DetailTile(label: 'Job link', value: asString(storedJob['url'])!),
          const SizedBox(height: 18),
          const SectionHeader(title: 'Prepared package'),
          if (_loadingDetail)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: LoadingView(label: 'Loading the prepared package'),
            )
          else if (_detailError != null)
            InfoBanner(
              message:
                  '$_detailError The core details above still come from your application record.',
              tone: InfoTone.warning,
            )
          else if (_detail == null ||
              (_detail!['package'] == null && _detail!['prepared'] == null))
            const InfoBanner(
              message:
                  'No prepared documents are attached to this application yet. Resume Studio and document '
                  'generation live under Profile → Career & CV.',
            )
          else
            ...TextBlockLists(_detail!['package'] ?? _detail!['prepared']),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _openJobLink,
            icon: const Icon(Icons.open_in_new, size: 18),
            label: const Text('Open the job posting'),
          ),
          const SizedBox(height: 10),
          if (_application.isActive)
            FilledButton.icon(
              onPressed: _busy ? null : _withdraw,
              style: FilledButton.styleFrom(
                backgroundColor: BrandColors.dangerBg,
                foregroundColor: BrandColors.danger,
              ),
              icon: const Icon(Icons.undo, size: 18),
              label: const Text('Withdraw application'),
            )
          else
            const InfoBanner(
              message: 'This application is closed (status: final). No further actions are available.',
            ),
          const SizedBox(height: 14),
          const Text(
            'Statuses come from your Jobiest account. Automatic submission only runs when your plan '
            'entitles it — the Applications tab states clearly when it does not.',
            style: TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.45),
          ),
        ],
      ),
    );
  }
}

class _DetailTile extends StatelessWidget {
  const _DetailTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 140,
            child: Text(label, style: const TextStyle(color: BrandColors.muted, fontSize: 13.5)),
          ),
          Expanded(child: Text(value, style: const TextStyle(height: 1.4))),
        ],
      ),
    );
  }
}

/// Renders an arbitrary backend object as labelled lines, so nothing is
/// paraphrased or invented.
List<Widget> TextBlockLists(Object? value) {
  final widgets = <Widget>[];
  if (value is Map<String, dynamic>) {
    for (final entry in value.entries) {
      final entryValue = entry.value;
      if (entryValue is String && entryValue.trim().isNotEmpty) {
        widgets.add(_DetailTile(label: entry.key, value: entryValue.trim()));
      } else if (entryValue is num || entryValue is bool) {
        widgets.add(_DetailTile(label: entry.key, value: '$entryValue'));
      } else if (entryValue is List && entryValue.isNotEmpty) {
        widgets.add(_DetailTile(
          label: entry.key,
          value: entryValue.map((item) => item.toString()).join('\n'),
        ));
      }
    }
  }
  if (widgets.isEmpty) {
    widgets.add(const InfoBanner(message: 'Nothing was recorded for this section.'));
  }
  return widgets;
}
