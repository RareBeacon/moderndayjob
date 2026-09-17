import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/widgets/state_views.dart';
import '../../models/job.dart';
import 'data/jobs_repository.dart';
import 'job_detail_screen.dart';
import 'jobs_screen.dart';

class SavedJobsScreen extends StatefulWidget {
  const SavedJobsScreen({super.key});

  @override
  State<SavedJobsScreen> createState() => _SavedJobsScreenState();
}

class _SavedJobsScreenState extends State<SavedJobsScreen> {
  bool _loading = true;
  String? _error;
  List<Job> _jobs = <Job>[];

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
      final jobs = await context.read<JobsRepository>().savedJobs();
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

  Future<void> _remove(Job job) async {
    try {
      await context.read<JobsRepository>().unsaveJob(job.id);
      if (!mounted) return;
      setState(() => _jobs = _jobs.where((item) => item.id != job.id).toList());
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Saved jobs')),
      body: _loading
          ? const LoadingView(label: 'Loading saved jobs')
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : _jobs.isEmpty
                  ? const EmptyView(
                      title: 'No saved jobs yet',
                      message:
                          'Tap the bookmark on any listing to keep it here. Saved jobs sync through your Jobiest account.',
                      icon: Icons.bookmark_border,
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                        itemCount: _jobs.length,
                        itemBuilder: (context, index) {
                          final job = _jobs[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: JobCard(
                              job: job,
                              trailing: IconButton(
                                tooltip: 'Remove',
                                icon: const Icon(Icons.close, size: 18),
                                onPressed: () => _remove(job),
                              ),
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
    );
  }
}

