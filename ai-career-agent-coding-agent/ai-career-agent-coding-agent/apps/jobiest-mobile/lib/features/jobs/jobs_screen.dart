import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../../models/job.dart';
import 'data/jobs_repository.dart';
import 'job_detail_screen.dart';
import 'saved_jobs_screen.dart';

class JobsScreen extends StatefulWidget {
  const JobsScreen({super.key});

  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> {
  final _searchController = TextEditingController();
  final _locationController = TextEditingController();

  bool _loading = true;
  String? _error;
  List<Job> _jobs = <Job>[];
  bool _remoteOnly = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _searchController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final jobs = await context.read<JobsRepository>().listJobs();
      if (!mounted) return;
      setState(() {
        _jobs = jobs;
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

  List<Job> get _filtered {
    final query = _searchController.text.trim().toLowerCase();
    final location = _locationController.text.trim().toLowerCase();
    return _jobs.where((job) {
      if (_remoteOnly && !job.isRemote) return false;
      if (location.isNotEmpty) {
        final jobLocation = (job.location ?? '').toLowerCase();
        if (!jobLocation.contains(location)) return false;
      }
      if (query.isEmpty) return true;
      return job.title.toLowerCase().contains(query) ||
          job.company.toLowerCase().contains(query) ||
          (_jobBlob(job).contains(query));
    }).toList();
  }

  String _jobBlob(Job job) {
    final parts = <String>[
      job.location ?? '',
      job.salary ?? '',
      job.employmentType ?? '',
      job.remotePolicy ?? '',
      job.description ?? '',
    ];
    return parts.join(' ').toLowerCase();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Jobs'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Saved jobs',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const SavedJobsScreen()),
            ),
            icon: const Icon(Icons.bookmark_border),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Column(
              children: <Widget>[
                TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    hintText: 'Search job titles, companies, skills',
                    prefixIcon: Icon(Icons.search, size: 20),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: TextField(
                        controller: _locationController,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          hintText: 'Location',
                          prefixIcon: Icon(Icons.place_outlined, size: 20),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilterChip(
                      label: const Text('Remote'),
                      selected: _remoteOnly,
                      onSelected: (value) => setState(() => _remoteOnly = value),
                    ),
                    IconButton(
                      tooltip: 'Clear filters',
                      onPressed: () => setState(() {
                        _searchController.clear();
                        _locationController.clear();
                        _remoteOnly = false;
                      }),
                      icon: const Icon(Icons.filter_alt_off_outlined),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const LoadingView(label: 'Fetching live listings')
                : _error != null
                    ? ErrorView(message: _error!, onRetry: _load)
                    : _filtered.isEmpty
                        ? EmptyView(
                            title: _jobs.isEmpty ? 'No listings right now' : 'No matches',
                            message: _jobs.isEmpty
                                ? 'The jobs pool came back empty. Pull to refresh — ingestion runs on a schedule.'
                                : 'Nothing in the current listings matches those filters. Try removing one.',
                            icon: _jobs.isEmpty ? Icons.work_off_outlined : Icons.search_off,
                            actionLabel: 'Clear filters',
                            onAction: () => setState(() {
                              _searchController.clear();
                              _locationController.clear();
                              _remoteOnly = false;
                            }),
                          )
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                              itemCount: _filtered.length + 1,
                              itemBuilder: (context, index) {
                                if (index == 0) {
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Text(
                                      '${_filtered.length} of ${_jobs.length} live listings · newest first',
                                      style: const TextStyle(
                                          color: BrandColors.muted, fontSize: 12.5),
                                    ),
                                  );
                                }
                                final job = _filtered[index - 1];
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: JobCard(
                                    job: job,
                                    onTap: () => Navigator.of(context).push(
                                      MaterialPageRoute<void>(
                                        builder: (_) => JobDetailScreen(job: job),
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class JobCard extends StatelessWidget {
  const JobCard({super.key, required this.job, required this.onTap, this.trailing});

  final Job job;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: BrandColors.card,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: BrandColors.line),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(15),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      job.title,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: BrandColors.ink,
                      ),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
              const SizedBox(height: 4),
              Text(
                job.company,
                style: const TextStyle(color: BrandColors.brandStrong, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: <Widget>[
                  if (job.location != null) _Tag(icon: Icons.place_outlined, label: job.location!),
                  if (job.isRemote) const _Tag(icon: Icons.laptop_mac, label: 'Remote'),
                  if (job.employmentType != null)
                    _Tag(icon: Icons.schedule, label: job.employmentType!),
                  if (job.salary != null) _Tag(icon: Icons.payments_outlined, label: job.salary!),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: <Widget>[
                  Text(
                    job.sourceLabel,
                    style: const TextStyle(color: BrandColors.muted, fontSize: 12),
                  ),
                  const Spacer(),
                  Text(
                    job.createdAt == null
                        ? ''
                        : 'Listed ${_dateLabel(job.createdAt!)}',
                    style: const TextStyle(color: BrandColors.muted, fontSize: 12),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _dateLabel(DateTime value) {
    final days = DateTime.now().difference(value.toLocal()).inDays;
    if (days <= 0) return 'today';
    if (days == 1) return 'yesterday';
    return '$days days ago';
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: BrandColors.brandSoft,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: BrandColors.brandLine),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 13, color: BrandColors.brandStrong),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              color: BrandColors.brandStrong,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
