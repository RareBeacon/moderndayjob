import 'json.dart';
import 'job.dart';

/// A tracked application (`GET /api/applications`). The API returns the row
/// plus its normalized `job`.
class JobApplication {
  JobApplication({
    required this.id,
    required this.status,
    this.jobId,
    this.email,
    this.submittedAt,
    this.createdAt,
    this.error,
    this.job,
  });

  final String id;
  final String status;
  final String? jobId;
  final String? email;
  final DateTime? submittedAt;
  final DateTime? createdAt;
  final String? error;
  final Job? job;

  String get title => job?.title ?? 'Untitled role';
  String get company => job?.company ?? 'Unknown company';

  bool get isActive => const <String>[
        'DRAFT',
        'PREPARING',
        'AWAITING_APPROVAL',
        'APPROVED',
        'QUEUED',
      ].contains(status);

  factory JobApplication.fromJson(Map<String, dynamic> json) {
    final jobJson = json['job'];
    return JobApplication(
      id: asStringOr(json['id'], ''),
      status: asStringOr(json['status'], 'DRAFT'),
      jobId: asString(json['job_id']),
      email: asString(json['email']),
      submittedAt: asDate(json['submitted_at']),
      createdAt: asDate(json['created_at']),
      error: asString(json['error']),
      job: jobJson is Map<String, dynamic> ? Job.fromJson(jobJson) : null,
    );
  }

  static List<JobApplication> listFrom(Map<String, dynamic> body) =>
      asMapList(body['applications']).map(JobApplication.fromJson).toList();
}
