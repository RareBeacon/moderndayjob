import 'json.dart';

/// A job listing from the shared Jobiest pool (`GET /api/jobs`).
class Job {
  Job({
    required this.id,
    required this.source,
    required this.company,
    required this.title,
    required this.url,
    this.location,
    this.metadata = const <String, dynamic>{},
    this.createdAt,
    this.savedAt,
    this.matchScore,
    this.matchRationale,
  });

  final String id;
  final String source;
  final String company;
  final String title;
  final String url;
  final String? location;
  final Map<String, dynamic> metadata;
  final DateTime? createdAt;

  /// Present only on rows that came back from `/api/saved-jobs`.
  final DateTime? savedAt;

  /// Present only on rows scored by the matching engine (`/api/ai/match`).
  final int? matchScore;
  final String? matchRationale;

  String? get salary => asString(
      metadata['salary'] ?? metadata['salary_range'] ?? metadata['compensation']);

  String? get employmentType =>
      asString(metadata['employment_type'] ?? metadata['employmentType'] ?? metadata['type']);

  String? get remotePolicy =>
      asString(metadata['remote'] ?? metadata['remote_type'] ?? metadata['workplace']);

  String? get description =>
      asString(metadata['description'] ?? metadata['summary'] ?? metadata['snippet']);

  String? get postedText => asString(metadata['posted_at'] ?? metadata['posted']);

  bool get isRemote {
    final policy = (remotePolicy ?? '').toLowerCase();
    return policy.contains('remote') || metadata['remote'] == true;
  }

  String get sourceLabel {
    switch (source.toUpperCase()) {
      case 'MANUAL':
        return 'Added manually';
      case 'REMOTEOK':
        return 'RemoteOK';
      case 'ARBEITNOW':
        return 'Arbeitnow';
      case 'ADZUNA':
        return 'Adzuna';
      case 'JOOBLE':
        return 'Jooble';
      default:
        return source.isEmpty ? 'Jobiest' : source;
    }
  }

  factory Job.fromJson(Map<String, dynamic> json) => Job(
        id: asStringOr(json['id'], ''),
        source: asStringOr(json['source'], ''),
        company: asStringOr(json['company'], 'Unknown company'),
        title: asStringOr(json['title'], 'Untitled role'),
        url: asStringOr(json['url'], ''),
        location: asString(json['location']),
        metadata: asMap(json['metadata']),
        createdAt: asDate(json['created_at'] ?? json['createdAt']),
        savedAt: asDate(json['saved_at'] ?? json['savedAt']),
        matchScore: json['score'] == null && json['match_score'] == null
            ? null
            : asInt(json['score'] ?? json['match_score']),
        matchRationale: asString(json['rationale'] ?? json['reason']),
      );

  static List<Job> listFrom(Object? value) {
    if (value is Map<String, dynamic>) {
      return asMapList(value['jobs']).map(Job.fromJson).toList();
    }
    return asMapList(value).map(Job.fromJson).toList();
  }
}
