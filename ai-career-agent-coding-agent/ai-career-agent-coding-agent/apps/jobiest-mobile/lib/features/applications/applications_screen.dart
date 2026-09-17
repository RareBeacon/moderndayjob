import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/formatters.dart';
import '../../core/widgets/state_views.dart';
import '../../models/application.dart';
import 'application_detail_screen.dart';
import 'data/applications_repository.dart';
import 'track_application_screen.dart';

class ApplicationsScreen extends StatefulWidget {
  const ApplicationsScreen({super.key});

  @override
  State<ApplicationsScreen> createState() => _ApplicationsScreenState();
}

class _ApplicationsScreenState extends State<ApplicationsScreen> {
  bool _loading = true;
  String? _error;
  ApplicationsPage? _page;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await context.read<ApplicationsRepository>().list();
      if (!mounted) return;
      setState(() {
        _page = page;
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

  @override
  Widget build(BuildContext context) {
    final applications = _page?.applications ?? <JobApplication>[];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Applications'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Track an application',
            onPressed: () async {
              final created = await Navigator.of(context).push<bool>(
                MaterialPageRoute<bool>(builder: (_) => const TrackApplicationScreen()),
              );
              if (created == true) await _load();
            },
            icon: const Icon(Icons.add),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const LoadingView(label: 'Loading your applications')
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: applications.isEmpty
                      ? ListView(
                          children: <Widget>[
                            SizedBox(
                              height: MediaQuery.of(context).size.height * 0.6,
                              child: EmptyView(
                                title: 'No applications tracked yet',
                                message:
                                    'Open a job and tap "Track this application" after you apply on the '
                                    'employer\u2019s site, or add one manually with the + button.',
                                icon: Icons.assignment_outlined,
                                actionLabel: 'Add one manually',
                                onAction: () async {
                                  final created = await Navigator.of(context).push<bool>(
                                    MaterialPageRoute<bool>(
                                        builder: (_) => const TrackApplicationScreen()),
                                  );
                                  if (created == true) await _load();
                                },
                              ),
                            ),
                          ],
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                          children: <Widget>[
                            if (_page?.automationEnabled == false)
                              const Padding(
                                padding: EdgeInsets.only(bottom: 14),
                                child: InfoBanner(
                                  message:
                                      'Automatic submission is not enabled on your plan. Applications are '
                                      'tracked and reviewed by you; Jobiest never submits on your behalf '
                                      'without entitlement.',
                                ),
                              ),
                            ...applications.map(
                              (application) => Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _ApplicationCard(
                                  application: application,
                                  onTap: () => Navigator.of(context)
                                      .push(MaterialPageRoute<void>(
                                        builder: (_) =>
                                            ApplicationDetailScreen(application: application),
                                      ))
                                      .then((_) => _load()),
                                ),
                              ),
                            ),
                          ],
                        ),
                ),
    );
  }
}

class _ApplicationCard extends StatelessWidget {
  const _ApplicationCard({required this.application, required this.onTap});

  final JobApplication application;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: BrandColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BrandColors.line),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      application.title,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
                    ),
                  ),
                  ApplicationStatusChip(status: application.status),
                ],
              ),
              const SizedBox(height: 4),
              Text(application.company, style: const TextStyle(color: BrandColors.brandStrong)),
              const SizedBox(height: 8),
              Text(
                application.submittedAt != null
                    ? 'Submitted ${relativeDate(application.submittedAt)}'
                    : 'Tracked ${relativeDate(application.createdAt)}',
                style: const TextStyle(color: BrandColors.muted, fontSize: 12.5),
              ),
              if (application.error != null && application.error!.isNotEmpty) ...<Widget>[
                const SizedBox(height: 8),
                Text(application.error!,
                    style: const TextStyle(color: BrandColors.danger, fontSize: 12.5)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ApplicationStatusChip extends StatelessWidget {
  const ApplicationStatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    late final Color background;
    late final Color foreground;
    switch (status) {
      case 'SUBMITTED':
      case 'APPROVED':
        background = BrandColors.successBg;
        foreground = BrandColors.success;
      case 'REJECTED':
        background = BrandColors.dangerBg;
        foreground = BrandColors.danger;
      case 'WITHDRAWN':
        background = const Color(0xFFF3F4F6);
        foreground = BrandColors.muted;
      case 'INTERVIEW':
        background = BrandColors.brandSoft;
        foreground = BrandColors.brandStrong;
      default:
        background = BrandColors.warningBg;
        foreground = BrandColors.warning;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        statusLabel(status),
        style: TextStyle(color: foreground, fontSize: 11.5, fontWeight: FontWeight.w700),
      ),
    );
  }
}
