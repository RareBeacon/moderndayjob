import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../../models/job.dart';
import '../applications/data/applications_repository.dart';
import 'data/jobs_repository.dart';

class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({super.key, required this.job});

  final Job job;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  bool _saved = false;
  bool _savingInFlight = false;
  bool _preparing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadSavedState());
  }

  Future<void> _loadSavedState() async {
    try {
      final saved = await context.read<JobsRepository>().savedJobs();
      if (!mounted) return;
      setState(() => _saved = saved.any((job) => job.id == widget.job.id));
    } on ApiException {
      // Saved state is a convenience; a failure must not block the screen.
    }
  }

  Future<void> _toggleSaved() async {
    if (_savingInFlight) return;
    setState(() => _savingInFlight = true);
    final repository = context.read<JobsRepository>();
    final wasSaved = _saved;
    try {
      if (wasSaved) {
        await repository.unsaveJob(widget.job.id);
      } else {
        await repository.saveJob(widget.job.id);
      }
      if (!mounted) return;
      setState(() => _saved = !wasSaved);
      showAppMessage(context, wasSaved ? 'Removed from saved jobs' : 'Saved to your list');
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppMessage(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _savingInFlight = false);
    }
  }

  Future<void> _openListing() async {
    final uri = Uri.tryParse(widget.job.url);
    if (uri == null || widget.job.url.isEmpty) {
      showAppMessage(context, 'This listing has no application link.', error: true);
      return;
    }
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      showAppMessage(context, 'No browser could open that link.', error: true);
    }
  }

  /// Creates (or returns) the tracked application through the real backend
  /// workflow. It does NOT claim the employer received anything.
  Future<void> _prepareApplication() async {
    setState(() => _preparing = true);
    try {
      final result = await context.read<ApplicationsRepository>().prepare(widget.job.id);
      if (!mounted) return;
      final application = result['application'];
      final id = application is Map<String, dynamic> ? application['id'] : null;
      showAppMessage(
        context,
        id == null
            ? 'Application tracked.'
            : 'Tracked as a draft application. Finish it from the Applications tab.',
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      showAppMessage(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _preparing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final description = job.description;
    return Scaffold(
      appBar: AppBar(
        title: Text(job.company, overflow: TextOverflow.ellipsis),
        actions: <Widget>[
          IconButton(
            tooltip: _saved ? 'Remove from saved' : 'Save job',
            onPressed: _savingInFlight ? null : _toggleSaved,
            icon: Icon(_saved ? Icons.bookmark : Icons.bookmark_border),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
        children: <Widget>[
          Text(
            job.title,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, height: 1.25),
          ),
          const SizedBox(height: 6),
          Text(
            job.company,
            style: const TextStyle(
                fontSize: 15, color: BrandColors.brandStrong, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              if (job.location != null)
                Chip(label: Text(job.location!), avatar: const Icon(Icons.place_outlined, size: 16)),
              if (job.isRemote)
                const Chip(label: Text('Remote'), avatar: Icon(Icons.laptop_mac, size: 16)),
              if (job.employmentType != null)
                Chip(label: Text(job.employmentType!)),
              if (job.salary != null) Chip(label: Text(job.salary!)),
              Chip(label: Text(job.sourceLabel)),
            ],
          ),
          const SizedBox(height: 18),
          if (job.matchScore != null) ...<Widget>[
            InfoBanner(
              tone: InfoTone.info,
              message: 'Match score ${job.matchScore}/100'
                  '${job.matchRationale == null ? '' : ' · ${job.matchRationale}'}',
            ),
            const SizedBox(height: 14),
          ],
          const SectionHeader(title: 'Role description'),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: BrandColors.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: BrandColors.line),
            ),
            child: Text(
              description ?? 'The source listing did not include a description. Open the original '
                  'posting for the full text.',
              style: const TextStyle(height: 1.55),
            ),
          ),
          if (job.metadata.isNotEmpty) ...<Widget>[
            const SizedBox(height: 18),
            const SectionHeader(title: 'Listing data'),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: BrandColors.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: BrandColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: job.metadata.entries
                    .where((entry) => entry.value is String || entry.value is num)
                    .take(10)
                    .map((entry) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Text(
                            '${entry.key}: ${entry.value}',
                            style: const TextStyle(color: BrandColors.muted, fontSize: 12.5),
                          ),
                        ))
                    .toList(),
              ),
            ),
          ],
          const SizedBox(height: 22),
          FilledButton.icon(
            onPressed: _openListing,
            icon: const Icon(Icons.open_in_new, size: 18),
            label: const Text('Open original listing'),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _preparing ? null : _prepareApplication,
            icon: _preparing
                ? const SizedBox(
                    width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.assignment_add, size: 18),
            label: const Text('Track this application'),
          ),
          const SizedBox(height: 12),
          const Text(
            'Opening the listing takes you to the employer or job board to apply. Jobiest tracks the '
            'application so it appears in your Applications tab — it never claims an employer received '
            'anything on its own.',
            style: TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.45),
          ),
        ],
      ),
    );
  }
}
