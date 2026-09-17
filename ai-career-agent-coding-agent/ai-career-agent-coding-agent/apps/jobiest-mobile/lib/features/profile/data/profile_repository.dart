import '../../../core/network/api_client.dart';
import '../../../models/account.dart';
import '../../../models/json.dart';

/// Profile, career profile, plan entitlements, preferences and documents — all
/// from the existing routes, all user-scoped server-side by the Bearer token.
class ProfileRepository {
  ProfileRepository(this._api);

  final ApiClient _api;

  Future<AccountOverview> account() async {
    final body = await _api.getJson('/api/profile');
    return AccountOverview.fromJson(body);
  }

  Future<void> saveProfile({
    required String fullName,
    required List<String> targetRoles,
    String? applicationEmail,
    String? headline,
    String? summary,
    List<String> skills = const <String>[],
  }) async {
    // Mirrors lib/schemas/profile.ts exactly: `full_name` >= 2 chars,
    // `target_roles` 1..6 entries, and `application_email` must be an empty
    // string (the route's literal('') branch) rather than null.
    await _api.putJson('/api/profile', body: <String, dynamic>{
      'full_name': fullName.trim(),
      'target_roles': targetRoles.take(6).toList(),
      'application_email': (applicationEmail ?? '').trim(),
      'headline': (headline ?? '').trim(),
      'summary': (summary ?? '').trim(),
      'skills': skills.take(40).toList(),
      'experience': <Object>[],
      'education': <Object>[],
      'links': <String, Object>{},
    });
  }

  Future<ProfileCompleteness> completeness() async {
    final body = await _api.getJson('/api/profile/completeness');
    return ProfileCompleteness.fromJson(body);
  }

  Future<Entitlements> entitlements() async {
    final body = await _api.getJson('/api/entitlements');
    return Entitlements.fromJson(body);
  }

  Future<JobPreferences> preferences() async {
    final body = await _api.getJson('/api/preferences');
    return JobPreferences.fromJson(asMap(body['preferences']));
  }

  Future<void> savePreferences({
    required List<String> remoteTypes,
    required List<String> locations,
    required List<String> employmentTypes,
    int? salaryMin,
    String? currency,
    String? applicationMode,
    int? dailyTarget,
  }) async {
    await _api.putJson('/api/preferences', body: <String, dynamic>{
      'remote_types': remoteTypes,
      'locations': locations,
      'employment_types': employmentTypes,
      'salary_min': salaryMin,
      'currency': currency ?? 'USD',
      'application_mode': applicationMode ?? 'REVIEW',
      'daily_target': dailyTarget ?? 5,
    });
  }

  Future<List<CareerDocument>> documents() async {
    final body = await _api.getJson('/api/documents');
    return CareerDocument.listFrom(body);
  }

  Future<List<CareerDocument>> generatedDocuments() async {
    final body = await _api.getJson('/api/documents/generated');
    return CareerDocument.listFrom(body);
  }
}
