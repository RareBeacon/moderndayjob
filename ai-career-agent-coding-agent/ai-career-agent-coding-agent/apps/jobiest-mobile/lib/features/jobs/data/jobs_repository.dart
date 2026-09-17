import '../../../core/network/api_client.dart';
import '../../../models/job.dart';

/// Job listings and saved jobs. Both come from the existing backend routes:
/// `GET /api/jobs` (public pool) and `/api/saved-jobs` (per-user, Bearer-auth).
class JobsRepository {
  JobsRepository(this._api);

  final ApiClient _api;

  Future<List<Job>> listJobs() async {
    final body = await _api.getJson('/api/jobs', authenticated: false);
    return Job.listFrom(body);
  }

  Future<List<Job>> savedJobs() async {
    final body = await _api.getJson('/api/saved-jobs');
    return Job.listFrom(body);
  }

  Future<void> saveJob(String jobId) async {
    await _api.putJson('/api/saved-jobs', body: <String, String>{'jobId': jobId});
  }

  Future<void> unsaveJob(String jobId) async {
    await _api.deleteJson('/api/saved-jobs', body: <String, String>{'jobId': jobId});
  }
}
