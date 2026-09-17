import '../../../core/network/api_client.dart';
import '../../../models/application.dart';
import '../../../models/json.dart';

class ApplicationsPage {
  ApplicationsPage({required this.applications, required this.automationEnabled});

  final List<JobApplication> applications;

  /// Whether the account's current plan allows automated submission — reported
  /// by the backend, not assumed by the app.
  final bool automationEnabled;
}

/// Application tracking. Every call hits the existing routes; nothing about an
/// application is stored or faked on the device.
class ApplicationsRepository {
  ApplicationsRepository(this._api);

  final ApiClient _api;

  Future<ApplicationsPage> list() async {
    final body = await _api.getJson('/api/applications');
    return ApplicationsPage(
      applications: JobApplication.listFrom(body),
      automationEnabled: asBool(body['automationEnabled']),
    );
  }

  Future<Map<String, dynamic>> detail(String id) => _api.getJson('/api/applications/$id');

  /// Creates (or returns) the tracked application for a job. This is the real
  /// backend workflow — it can fail with EXPIRED_JOB or NOT_FOUND, which the UI
  /// reports as-is.
  Future<Map<String, dynamic>> prepare(String jobId) =>
      _api.postJson('/api/applications/prepare', body: <String, String>{'jobId': jobId});

  /// Records an application the user submitted on the employer's own site.
  Future<Map<String, dynamic>> trackManual({
    required String company,
    required String title,
    required String url,
    String status = 'SUBMITTED',
  }) =>
      _api.postJson('/api/applications', body: <String, String>{
        'mode': 'manual',
        'company': company,
        'title': title,
        'url': url,
        'status': status,
      });

  Future<Map<String, dynamic>> withdraw(String id) =>
      _api.postJson('/api/applications/$id/withdraw');
}
