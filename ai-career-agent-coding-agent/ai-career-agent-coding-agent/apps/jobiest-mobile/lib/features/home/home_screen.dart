import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/util/formatters.dart';
import '../../core/widgets/state_views.dart';
import '../../models/account.dart';
import '../../models/job.dart';
import '../applications/data/applications_repository.dart';
import '../auth/state/auth_controller.dart';
import '../jobs/data/jobs_repository.dart';
import '../jobs/job_detail_screen.dart';
import '../jobs/jobs_screen.dart';
import '../profile/data/profile_repository.dart';
import '../shell/app_shell.dart';
import '../support/support_screen.dart';

/// Home tab: real data only — the user's profile readiness, real listings from
/// the Jobiest pool, saved jobs and application counts.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _loading = true;
  String? _error;

  List<Job> _jobs = <Job>[];
  List<Job> _savedJobs = <Job>[];
  ProfileCompleteness? _completeness;
  Entitlements? _entitlements;
  int? _applicationCount;
  AccountOverview? _account;

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
    final jobs = context.read<JobsRepository>();
    final profile = context.read<ProfileRepository>();
    final applications = context.read<ApplicationsRepository>();

    try {
      // Public listings first so Home still works if a user-scoped call fails.
      final listings = await jobs.listJobs();
      if (!mounted) return;
      setState(() => _jobs = listings.take(6).toList());

      final results = await Future.wait<Object?>(<Future<Object?>>[
        profile.completeness().then<Object?>((value) => value).catchError((Object _) => null),
        profile.entitlements().then<Object?>((value) => value).catchError((Object _) => null),
        profile.account().then<Object?>((value) => value).catchError((Object _) => null),
        jobs.savedJobs().then<Object?>((value) => value).catchError((Object _) => null),
        applications.list().then<Object?>((value) => value).catchError((Object _) => null),
      ]);
      if (!mounted) return;
      setState(() {
        _completeness = results[0] is ProfileCompleteness ? results[0] as ProfileCompleteness : null;
        _entitlements = results[1] is Entitlements ? results[1] as Entitlements : null;
        _account = results[2] is AccountOverview ? results[2] as AccountOverview : null;
        _savedJobs = results[3] is List<Job> ? results[3] as List<Job> : <Job>[];
        _applicationCount = results[4] is ApplicationsPage
            ? (results[4] as ApplicationsPage).applications.length
            : null;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final name = _account?.profile.displayName;
    final isNewUser = (_completeness?.percent ?? 0) < 40;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: <Widget>[
            const JobiestMark(size: 22),
            const SizedBox(width: 10),
            const Text('Jobiest'),
          ],
        ),
        actions: <Widget>[
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const LoadingView(label: 'Loading your dashboard')
            : _error != null
                ? ListView(
                    children: <Widget>[
                      SizedBox(
                        height: MediaQuery.of(context).size.height * 0.55,
                        child: ErrorView(message: _error!, onRetry: _load),
                      ),
                    ],
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                    children: <Widget>[
                      Text(
                        'Welcome back, ${name ?? auth.email ?? 'there'}',
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w800,
                          color: BrandColors.ink,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _entitlements == null
                            ? 'Your career workspace'
                            : '${_entitlements!.planLabel} plan'
                                '${_entitlements!.aiCreditsRemaining != null ? ' · ${_entitlements!.aiCreditsRemaining} AI credits left' : ''}',
                        style: const TextStyle(color: BrandColors.muted),
                      ),
                      const SizedBox(height: 16),
                      _SearchEntry(onTap: () => _goToTab(AppShell.jobsIndex)),
                      if (isNewUser) ...<Widget>[
                        const SizedBox(height: 14),
                        _OnboardingCard(
                          percent: _completeness?.percent ?? 0,
                          nextSteps: _completeness?.next ?? const <String>[],
                          onStart: () => _goToTab(AppShell.profileIndex),
                        ),
                      ],
                      const SizedBox(height: 20),
                      const SectionHeader(title: 'Quick actions'),
                      _QuickActions(
                        onBrowseJobs: () => _goToTab(AppShell.jobsIndex),
                        onAgent: () => _goToTab(AppShell.agentIndex),
                        onApplications: () => _goToTab(AppShell.applicationsIndex),
                        onSupport: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => const SupportScreen()),
                        ),
                      ),
                      const SizedBox(height: 20),
                      _ReadinessCard(
                        completeness: _completeness,
                        savedCount: _savedJobs.length,
                        applicationCount: _applicationCount,
                        onOpenProfile: () => _goToTab(AppShell.profileIndex),
                      ),
                      const SizedBox(height: 22),
                      SectionHeader(
                        title: 'Fresh listings',
                        action: 'See all',
                        onAction: () => _goToTab(AppShell.jobsIndex),
                      ),
                      if (_jobs.isEmpty)
                        const InfoBanner(
                          message:
                              'No listings came back from the backend just now. Pull down to retry.',
                        )
                      else
                        ..._jobs.map((job) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: JobCard(
                                job: job,
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => JobDetailScreen(job: job),
                                  ),
                                ),
                              ),
                            )),
                      const SizedBox(height: 18),
                      const SectionHeader(title: 'Need a hand?'),
                      _SupportRow(
                        onSupport: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => const SupportScreen()),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Data refreshed ${relativeDate(DateTime.now())} from jobiest.com',
                        style: const TextStyle(color: BrandColors.muted, fontSize: 12),
                      ),
                    ],
                  ),
      ),
    );
  }

  void _goToTab(int index) {
    final shell = context.findAncestorStateOfType<AppShellState>();
    shell?.goTo(index);
  }
}

class _SearchEntry extends StatelessWidget {
  const _SearchEntry({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
        decoration: BoxDecoration(
          color: BrandColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: BrandColors.line),
        ),
        child: const Row(
          children: <Widget>[
            Icon(Icons.search, color: BrandColors.brandStrong),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Search roles, companies, locations',
                style: TextStyle(color: BrandColors.muted),
              ),
            ),
            Icon(Icons.arrow_forward, size: 18, color: BrandColors.muted),
          ],
        ),
      ),
    );
  }
}

class _OnboardingCard extends StatelessWidget {
  const _OnboardingCard({
    required this.percent,
    required this.nextSteps,
    required this.onStart,
  });

  final int percent;
  final List<String> nextSteps;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: BrandColors.brandSoft,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BrandColors.brandLine),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'Getting started · profile $percent% complete',
            style: const TextStyle(fontWeight: FontWeight.w800, color: BrandColors.brandStrong),
          ),
          const SizedBox(height: 8),
          if (nextSteps.isEmpty)
            const Text(
              'Your profile is complete. Add job preferences so the agent can match roles for you.',
              style: TextStyle(color: BrandColors.brandStrong, height: 1.4),
            )
          else
            ...nextSteps.take(3).map(
                  (step) => Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        const Icon(Icons.circle, size: 6, color: BrandColors.brandStrong),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(step,
                              style: const TextStyle(color: BrandColors.brandStrong, height: 1.35)),
                        ),
                      ],
                    ),
                  ),
                ),
          const SizedBox(height: 12),
          FilledButton.tonal(
            onPressed: onStart,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
            child: const Text('Finish your profile'),
          ),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({
    required this.onBrowseJobs,
    required this.onAgent,
    required this.onApplications,
    required this.onSupport,
  });

  final VoidCallback onBrowseJobs;
  final VoidCallback onAgent;
  final VoidCallback onApplications;
  final VoidCallback onSupport;

  @override
  Widget build(BuildContext context) {
    final actions = <_Action>[
      _Action('Browse jobs', Icons.work_outline, onBrowseJobs),
      _Action('Ask the agent', Icons.auto_awesome_outlined, onAgent),
      _Action('Applications', Icons.assignment_outlined, onApplications),
      _Action('Support', Icons.support_agent, onSupport),
    ];
    return Row(
      children: actions
          .map((action) => Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: action == actions.last ? 0 : 8),
                  child: InkWell(
                    onTap: action.onTap,
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
                      decoration: BoxDecoration(
                        color: BrandColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: BrandColors.line),
                      ),
                      child: Column(
                        children: <Widget>[
                          Icon(action.icon, color: BrandColors.brandStrong, size: 22),
                          const SizedBox(height: 8),
                          Text(
                            action.label,
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ))
          .toList(),
    );
  }
}

class _Action {
  const _Action(this.label, this.icon, this.onTap);

  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

class _ReadinessCard extends StatelessWidget {
  const _ReadinessCard({
    required this.completeness,
    required this.savedCount,
    required this.applicationCount,
    required this.onOpenProfile,
  });

  final ProfileCompleteness? completeness;
  final int savedCount;
  final int? applicationCount;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final percent = completeness?.percent;
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
            children: <Widget>[
              const Expanded(
                child: Text(
                  'Career readiness',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5),
                ),
              ),
              TextButton(onPressed: onOpenProfile, child: const Text('Profile')),
            ],
          ),
          if (percent == null)
            const Text(
              'The backend did not return a readiness score for this account.',
              style: TextStyle(color: BrandColors.muted),
            )
          else ...<Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: percent / 100,
                minHeight: 8,
                backgroundColor: BrandColors.brandSoft,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Profile $percent% complete',
              style: const TextStyle(color: BrandColors.muted, fontSize: 13),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              Expanded(child: _Metric(label: 'Saved jobs', value: '$savedCount')),
              Expanded(
                child: _Metric(
                  label: 'Applications',
                  value: applicationCount?.toString() ?? '—',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(value,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        Text(label, style: const TextStyle(color: BrandColors.muted, fontSize: 12.5)),
      ],
    );
  }
}

class _SupportRow extends StatelessWidget {
  const _SupportRow({required this.onSupport});

  final VoidCallback onSupport;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: BrandColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BrandColors.line),
      ),
      child: ListTile(
        onTap: onSupport,
        leading: const Icon(Icons.support_agent),
        title: const Text('Contact support'),
        subtitle: const Text('Account, jobs, CV, applications, billing'),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}
