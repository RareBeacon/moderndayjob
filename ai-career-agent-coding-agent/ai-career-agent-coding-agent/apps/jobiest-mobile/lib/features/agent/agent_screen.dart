import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../../models/job.dart';
import '../jobs/job_detail_screen.dart';
import 'data/agent_repository.dart';

/// The AI Agent tab. Every action calls a real backend capability; there is no
/// canned chat and no invented reply. Usage limits and failures come from the
/// backend and are shown as they are.
class AgentScreen extends StatefulWidget {
  const AgentScreen({super.key});

  @override
  State<AgentScreen> createState() => _AgentScreenState();
}

class _AgentScreenState extends State<AgentScreen> {
  final _jobDescriptionController = TextEditingController();
  final _roleController = TextEditingController();

  bool _matching = false;
  bool _interviewing = false;
  bool _salaries = false;
  bool _paths = false;

  MatchResult? _matchResult;
  List<InterviewQuestion> _questions = <InterviewQuestion>[];
  List<TextBlock> _salaryRanges = <TextBlock>[];
  List<TextBlock> _careerPaths = <TextBlock>[];
  String? _notice;
  bool _noticeIsError = false;

  @override
  void dispose() {
    _jobDescriptionController.dispose();
    _roleController.dispose();
    super.dispose();
  }

  void _setNotice(String message, {bool error = false}) {
    setState(() {
      _notice = message;
      _noticeIsError = error;
    });
  }

  Future<void> _runMatch() async {
    setState(() => _matching = true);
    try {
      final result = await context.read<AgentRepository>().match();
      if (!mounted) return;
      setState(() => _matchResult = result);
      _setNotice(result.isEmpty
          ? 'Matching ran on ${result.scoredCount} listings and found nothing above the threshold. '
              'Broaden your job preferences or add more skills to your career profile.'
          : 'Scored ${result.scoredCount} listings · ${result.excludedCount} filtered out by your preferences.');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _matchResult = null);
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _matching = false);
    }
  }

  Future<void> _runInterview() async {
    final description = _jobDescriptionController.text.trim();
    if (description.length < 30) {
      _setNotice('Paste at least a few lines of the job description (30+ characters).', error: true);
      return;
    }
    setState(() => _interviewing = true);
    try {
      final questions = await context.read<AgentRepository>().interviewQuestions(description);
      if (!mounted) return;
      setState(() => _questions = questions);
      _setNotice(questions.isEmpty
          ? 'The backend returned no questions for that description.'
          : '${questions.length} questions generated from the description you pasted.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _interviewing = false);
    }
  }

  Future<void> _runSalary() async {
    final role = _roleController.text.trim();
    if (role.length < 2) {
      _setNotice('Enter a role, for example "backend engineer".', error: true);
      return;
    }
    setState(() => _salaries = true);
    try {
      final ranges = await context.read<AgentRepository>().salaryInsights(role);
      if (!mounted) return;
      setState(() => _salaryRanges = ranges);
      _setNotice(ranges.isEmpty
          ? 'No listings in the current job pool state pay for that role. Nothing is invented to fill the gap.'
          : 'Pay figures below are quoted from listings that state them.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _salaries = false);
    }
  }

  Future<void> _runPaths() async {
    setState(() => _paths = true);
    try {
      final paths = await context.read<AgentRepository>().careerPaths();
      if (!mounted) return;
      setState(() => _careerPaths = paths);
      _setNotice(paths.isEmpty
          ? 'No paths returned. Career paths need a career profile with verified skills.'
          : 'Suggestions are based on the skills stored in your career profile.');
    } on ApiException catch (error) {
      if (!mounted) return;
      _setNotice(error.message, error: true);
    } finally {
      if (mounted) setState(() => _paths = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AI Agent')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: <Widget>[
          const Text(
            'Your career agent',
            style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          const Text(
            'These are the agent capabilities that exist on the Jobiest backend today. '
            'Each one runs against your real account data and reports its own limits.',
            style: TextStyle(color: BrandColors.muted, height: 1.45),
          ),
          if (_notice != null) ...<Widget>[
            const SizedBox(height: 14),
            InfoBanner(
              message: _notice!,
              tone: _noticeIsError ? InfoTone.danger : InfoTone.info,
            ),
          ],
          const SizedBox(height: 18),
          _CapabilityCard(
            icon: Icons.insights_outlined,
            title: 'Match me to live roles',
            description:
                'Scores the current job pool against your career profile and job preferences, '
                'excluding roles you have already applied to.',
            actionLabel: _matching ? 'Scoring…' : 'Run matching',
            busy: _matching,
            onRun: _matching ? null : _runMatch,
          ),
          if (_matchResult != null) ...<Widget>[
            const SizedBox(height: 10),
            ..._matchResult!.matches.take(8).map((match) => _MatchTile(match: match)),
            if (_matchResult!.cappedCount > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '${_matchResult!.cappedCount} more listings were not scored in this session.',
                  style: const TextStyle(color: BrandColors.muted, fontSize: 12.5),
                ),
              ),
            if (_matchResult!.failureCount > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  '${_matchResult!.failureCount} listings could not be scored and were reported as failures.',
                  style: const TextStyle(color: BrandColors.muted, fontSize: 12.5),
                ),
              ),
          ],
          const SizedBox(height: 14),
          _CapabilityCard(
            icon: Icons.question_answer_outlined,
            title: 'Interview preparation',
            description:
                'Generates interview questions from a job description you paste, including which '
                'requirement each question probes.',
            actionLabel: _interviewing ? 'Generating…' : 'Generate questions',
            busy: _interviewing,
            onRun: _interviewing ? null : _runInterview,
            child: TextField(
              controller: _jobDescriptionController,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                hintText: 'Paste the job description here',
              ),
            ),
          ),
          if (_questions.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            ..._questions.map((question) => _BulletTile(
                  title: question.question,
                  subtitle: question.focus,
                )),
          ],
          const SizedBox(height: 14),
          _CapabilityCard(
            icon: Icons.payments_outlined,
            title: 'Pay signals',
            description:
                'Reads pay ranges that employers explicitly stated in live listings. Listings that '
                'state nothing are not guessed at.',
            actionLabel: _salaries ? 'Scanning…' : 'Scan pay data',
            busy: _salaries,
            onRun: _salaries ? null : _runSalary,
            child: TextField(
              controller: _roleController,
              decoration: const InputDecoration(hintText: 'Role, e.g. backend engineer'),
            ),
          ),
          if (_salaryRanges.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            ..._salaryRanges.map((range) =>
                _BulletTile(title: range.title, subtitle: range.lines.join('\n'))),
          ],
          const SizedBox(height: 14),
          _CapabilityCard(
            icon: Icons.route_outlined,
            title: 'Career paths',
            description:
                'Exploratory next-step suggestions derived from the verified skills in your career '
                'profile. Suggestions, never promises.',
            actionLabel: _paths ? 'Thinking…' : 'Suggest paths',
            busy: _paths,
            onRun: _paths ? null : _runPaths,
          ),
          if (_careerPaths.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            ..._careerPaths.map((path) =>
                _BulletTile(title: path.title, subtitle: path.lines.join('\n'))),
          ],
          const SizedBox(height: 22),
          const InfoBanner(
            message:
                'The agent runs on the Jobiest backend with your plan\u2019s daily limits. When a limit is '
                'reached the backend says so and the app shows that message — nothing is faked in its place.',
          ),
        ],
      ),
    );
  }
}

class _CapabilityCard extends StatelessWidget {
  const _CapabilityCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.actionLabel,
    required this.busy,
    required this.onRun,
    this.child,
  });

  final IconData icon;
  final String title;
  final String description;
  final String actionLabel;
  final bool busy;
  final VoidCallback? onRun;
  final Widget? child;

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
            children: <Widget>[
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: BrandColors.brandSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: BrandColors.brandStrong, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(title,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(description, style: const TextStyle(color: BrandColors.muted, height: 1.45)),
          if (child != null) ...<Widget>[
            const SizedBox(height: 12),
            child!,
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: onRun,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
            child: busy
                ? const SizedBox(
                    width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(actionLabel),
          ),
        ],
      ),
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile({required this.match});

  final JobMatch match;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: BrandColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BrandColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(match.title,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ),
              if (match.score != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: BrandColors.brandSoft,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text('${match.score}',
                      style: const TextStyle(
                          color: BrandColors.brandStrong, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(match.company, style: const TextStyle(color: BrandColors.brandStrong)),
          if (match.location != null && match.location!.isNotEmpty)
            Text(match.location!, style: const TextStyle(color: BrandColors.muted, fontSize: 12.5)),
          if (match.summary != null && match.summary!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            Text(match.summary!, style: const TextStyle(height: 1.45)),
          ],
          if (match.strengths.isNotEmpty || match.gaps.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            if (match.strengths.isNotEmpty)
              Text('Strengths: ${match.strengths.join(' · ')}',
                  style: const TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.4)),
            if (match.gaps.isNotEmpty)
              Text('Gaps: ${match.gaps.join(' · ')}',
                  style: const TextStyle(color: BrandColors.muted, fontSize: 12.5, height: 1.4)),
          ],
          if (match.url != null && match.url!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => launchUrl(
                Uri.parse(match.url!),
                mode: LaunchMode.externalApplication,
              ),
              icon: const Icon(Icons.open_in_new, size: 16),
              label: const Text('Open listing'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
            ),
          ],
        ],
      ),
    );
  }
}

class _BulletTile extends StatelessWidget {
  const _BulletTile({required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: BrandColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BrandColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.4)),
          if (subtitle != null && subtitle!.trim().isNotEmpty) ...<Widget>[
            const SizedBox(height: 5),
            Text(subtitle!, style: const TextStyle(color: BrandColors.muted, height: 1.45)),
          ],
        ],
      ),
    );
  }
}

/// Reusable job detail route helper for agent results.
void openJobFromAgent(BuildContext context, Job job) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => JobDetailScreen(job: job)),
  );
}
