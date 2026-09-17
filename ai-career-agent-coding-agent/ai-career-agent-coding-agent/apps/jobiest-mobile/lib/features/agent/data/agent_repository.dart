import '../../../core/network/api_client.dart';
import '../../../models/json.dart';

/// One scored job from `POST /api/ai/match` (the backend's matching engine).
class JobMatch {
  JobMatch({
    required this.jobId,
    required this.company,
    required this.title,
    this.location,
    this.url,
    this.score,
    this.verdict,
    this.summary,
    this.strengths = const <String>[],
    this.gaps = const <String>[],
    this.reasons = const <String>[],
  });

  final String jobId;
  final String company;
  final String title;
  final String? location;
  final String? url;
  final int? score;
  final String? verdict;
  final String? summary;
  final List<String> strengths;
  final List<String> gaps;
  final List<String> reasons;

  factory JobMatch.fromJson(Map<String, dynamic> json) => JobMatch(
        jobId: asStringOr(json['jobId'] ?? json['job_id'], ''),
        company: asStringOr(json['company'], 'Unknown company'),
        title: asStringOr(json['title'], 'Untitled role'),
        location: asString(json['location']),
        url: asString(json['url']),
        score: json['score'] == null ? null : asInt(json['score']),
        verdict: asString(json['verdict']),
        summary: asString(json['summary']),
        strengths: asStringList(json['strengths']),
        gaps: asStringList(json['gaps']),
        reasons: asStringList(json['reasons']),
      );
}

class MatchResult {
  MatchResult({
    required this.matches,
    required this.excludedCount,
    required this.cappedCount,
    required this.scoredCount,
    required this.failureCount,
  });

  final List<JobMatch> matches;
  final int excludedCount;
  final int cappedCount;
  final int scoredCount;
  final int failureCount;

  bool get isEmpty => matches.isEmpty;

  factory MatchResult.fromJson(Map<String, dynamic> json) {
    final raw = json['matches'];
    final matches = <JobMatch>[];
    if (raw is List) {
      for (final entry in raw) {
        if (entry is Map<String, dynamic>) matches.add(JobMatch.fromJson(entry));
      }
    }
    final failures = json['failures'];
    return MatchResult(
      matches: matches,
      excludedCount: asInt(json['excludedCount']),
      cappedCount: asInt(json['cappedCount']),
      scoredCount: asInt(json['scoredCount']),
      failureCount: failures is List ? failures.length : 0,
    );
  }
}

class InterviewQuestion {
  InterviewQuestion({required this.question, this.focus});

  final String question;
  final String? focus;

  factory InterviewQuestion.fromJson(Map<String, dynamic> json) => InterviewQuestion(
        question: asStringOr(json['question'], ''),
        focus: asString(json['focus']),
      );
}

/// A backend result rendered as labelled lines — used for shapes whose exact
/// fields may evolve (salary ranges, career paths) so the app never invents a
/// value it did not receive.
class TextBlock {
  TextBlock({required this.title, required this.lines});

  final String title;
  final List<String> lines;

  static List<TextBlock> listFrom(Object? value, {String titleKey = 'title'}) {
    final blocks = <TextBlock>[];
    if (value is List) {
      for (final entry in value) {
        if (entry is Map<String, dynamic>) {
          final title = asString(entry[titleKey] ?? entry['role'] ?? entry['name']) ?? 'Result';
          blocks.add(TextBlock(title: title, lines: stringLines(entry)));
        } else if (entry is String && entry.trim().isNotEmpty) {
          blocks.add(TextBlock(title: entry.trim(), lines: const <String>[]));
        }
      }
    }
    return blocks;
  }

  /// Every human-readable value in the map, in a stable order.
  static List<String> stringLines(Map<String, dynamic> map) {
    final lines = <String>[];
    map.forEach((key, value) {
      if (key == 'provider' || key == 'taskId' || key == 'taskVersion') return;
      if (value is String && value.trim().isNotEmpty) {
        lines.add(value.trim());
      } else if (value is num || value is bool) {
        lines.add('$key: $value');
      } else if (value is List) {
        final joined = value.whereType<String>().join(', ');
        if (joined.isNotEmpty) lines.add(joined);
      }
    });
    return lines;
  }
}

/// The AI Agent's real capabilities. Every method maps to an existing server
/// route; quota and rate-limit failures surface as [ApiException]s from the
/// backend, so usage limits are reported honestly.
class AgentRepository {
  AgentRepository(this._api);

  final ApiClient _api;

  /// Deterministic-listing matching against the user's stored career profile.
  Future<MatchResult> match({int? threshold}) async {
    final body = await _api.postJson('/api/ai/match', body: <String, dynamic>{
      if (threshold != null) 'threshold': threshold,
    });
    return MatchResult.fromJson(body);
  }

  Future<List<InterviewQuestion>> interviewQuestions(String jobDescription) async {
    final body =
        await _api.postJson('/api/ai/interview-questions', body: <String, dynamic>{
      'jobDescription': jobDescription,
    });
    final result = body['result'];
    final questions = <InterviewQuestion>[];
    if (result is Map<String, dynamic> && result['questions'] is List) {
      for (final entry in result['questions'] as List<dynamic>) {
        if (entry is Map<String, dynamic>) questions.add(InterviewQuestion.fromJson(entry));
      }
    }
    return questions;
  }

  /// Pay ranges explicitly stated in real listings — the backend rejects any
  /// citation it did not scan, so nothing here is invented.
  Future<List<TextBlock>> salaryInsights(String role) async {
    final body = await _api.postJson('/api/ai/salary-insights', body: <String, dynamic>{
      'role': role,
    });
    return TextBlock.listFrom(body['ranges'], titleKey: 'role');
  }

  Future<List<TextBlock>> careerPaths() async {
    final body = await _api.postJson('/api/ai/career-paths');
    return TextBlock.listFrom(body['paths']);
  }

  /// Deterministic ATS-style structure scan (no AI, no credits). The response
  /// shape is a fixed public rubric: score, findings, stats, keywords.
  Future<Map<String, dynamic>> atsScan({
    required String resumeText,
    String? jobDescription,
  }) async {
    return _api.postJson('/api/ats/scan', body: <String, dynamic>{
      'resumeText': resumeText,
      if (jobDescription != null && jobDescription.trim().isNotEmpty)
        'jobDescription': jobDescription,
    });
  }
}
