import 'json.dart';

class Profile {
  Profile({
    this.fullName,
    this.email,
    this.applicationEmail,
    this.targetRoles = const <String>[],
    this.workspaceId,
    this.accountStatus,
  });

  final String? fullName;
  final String? email;
  final String? applicationEmail;
  final List<String> targetRoles;
  final String? workspaceId;
  final String? accountStatus;

  String get displayName {
    final name = fullName?.trim();
    if (name != null && name.isNotEmpty) return name;
    final mail = email?.trim();
    if (mail != null && mail.contains('@')) return mail.split('@').first;
    return 'there';
  }

  bool get isActive => accountStatus == null || accountStatus == 'ACTIVE';

  factory Profile.fromJson(Map<String, dynamic> json) => Profile(
        fullName: asString(json['full_name']),
        email: asString(json['email']),
        applicationEmail: asString(json['application_email']),
        targetRoles: asStringList(json['target_roles']),
        workspaceId: asString(json['workspace_id']),
        accountStatus: asString(json['account_status']),
      );
}

class CareerProfile {
  CareerProfile({
    this.headline,
    this.summary,
    this.skills = const <String>[],
    this.experience = const <Map<String, dynamic>>[],
    this.education = const <Map<String, dynamic>>[],
    this.projects = const <Map<String, dynamic>>[],
    this.links = const <String, dynamic>{},
  });

  final String? headline;
  final String? summary;
  final List<String> skills;
  final List<Map<String, dynamic>> experience;
  final List<Map<String, dynamic>> education;
  final List<Map<String, dynamic>> projects;
  final Map<String, dynamic> links;

  bool get isEmpty =>
      (headline ?? '').isEmpty &&
      (summary ?? '').isEmpty &&
      skills.isEmpty &&
      experience.isEmpty &&
      education.isEmpty;

  String? get portfolioLink => asString(links['portfolio']);

  factory CareerProfile.fromJson(Map<String, dynamic> json) => CareerProfile(
        headline: asString(json['headline']),
        summary: asString(json['summary']),
        skills: asStringList(json['skills']),
        experience: asMapList(json['experience']),
        education: asMapList(json['education']),
        projects: asMapList(json['projects']),
        links: asMap(json['links']),
      );
}

class AccountOverview {
  AccountOverview({required this.profile, required this.career});

  final Profile profile;
  final CareerProfile career;

  static AccountOverview fromJson(Map<String, dynamic> body) => AccountOverview(
        profile: Profile.fromJson(asMap(body['profile'])),
        career: CareerProfile.fromJson(asMap(body['career'])),
      );
}

/// Quota / plan state from `GET /api/entitlements`
/// (view `v_workspace_entitlements`). Unknown columns are simply absent.
class Entitlements {
  Entitlements({
    this.plan,
    this.accountStatus,
    this.subscriptionStatus,
    this.trialEndsAt,
    this.automationEnabled = false,
    this.aiCreditsRemaining,
    this.applicationsRemaining,
    this.toolsRemaining,
  });

  final String? plan;
  final String? accountStatus;
  final String? subscriptionStatus;
  final DateTime? trialEndsAt;
  final bool automationEnabled;
  final int? aiCreditsRemaining;
  final int? applicationsRemaining;
  final int? toolsRemaining;

  String get planLabel {
    final value = (plan ?? 'FREE').toUpperCase();
    switch (value) {
      case 'MAX':
        return 'Max';
      case 'PREMIUM':
        return 'Premium';
      case 'BASIC':
        return 'Basic';
      default:
        return 'Free';
    }
  }

  bool get onTrial => (subscriptionStatus ?? '').toUpperCase() == 'TRIAL';

  factory Entitlements.fromJson(Map<String, dynamic> json) => Entitlements(
        plan: asString(json['plan']),
        accountStatus: asString(json['account_status']),
        subscriptionStatus: asString(json['subscription_status']),
        trialEndsAt: asDate(json['trial_ends_at']),
        automationEnabled: asBool(json['automation_enabled']),
        aiCreditsRemaining: json['ai_credits_remaining'] == null
            ? null
            : asInt(json['ai_credits_remaining']),
        applicationsRemaining: json['applications_remaining'] == null
            ? null
            : asInt(json['applications_remaining']),
        toolsRemaining:
            json['tools_remaining'] == null ? null : asInt(json['tools_remaining']),
      );
}

/// `GET /api/profile/completeness` — the real "career readiness" signal the
/// backend computes from stored profile data.
class ProfileCompleteness {
  ProfileCompleteness({required this.percent, this.next = const <String>[], this.checks = const <CompletenessCheck>[]});

  final int percent;
  final List<String> next;
  final List<CompletenessCheck> checks;

  factory ProfileCompleteness.fromJson(Map<String, dynamic> json) {
    final rawChecks = json['checks'];
    final checks = <CompletenessCheck>[];
    if (rawChecks is List) {
      for (final entry in rawChecks) {
        if (entry is List && entry.length >= 3) {
          checks.add(CompletenessCheck(
            key: asStringOr(entry[0], ''),
            done: asBool(entry[1]),
            label: asStringOr(entry[2], ''),
          ));
        }
      }
    }
    return ProfileCompleteness(
      percent: asInt(json['percent']),
      next: asStringList(json['next']),
      checks: checks,
    );
  }
}

class CompletenessCheck {
  CompletenessCheck({required this.key, required this.done, required this.label});

  final String key;
  final bool done;
  final String label;
}

/// `GET /api/preferences` — the agent's job-search preferences.
class JobPreferences {
  JobPreferences({
    this.remoteTypes = const <String>[],
    this.locations = const <String>[],
    this.employmentTypes = const <String>[],
    this.salaryMin,
    this.currency,
    this.applicationMode,
    this.dailyTarget,
    this.active = false,
  });

  final List<String> remoteTypes;
  final List<String> locations;
  final List<String> employmentTypes;
  final int? salaryMin;
  final String? currency;
  final String? applicationMode;
  final int? dailyTarget;
  final bool active;

  bool get isConfigured =>
      remoteTypes.isNotEmpty || locations.isNotEmpty || employmentTypes.isNotEmpty;

  factory JobPreferences.fromJson(Map<String, dynamic> json) => JobPreferences(
        remoteTypes: asStringList(json['remote_types']),
        locations: asStringList(json['locations']),
        employmentTypes: asStringList(json['employment_types']),
        salaryMin: json['salary_min'] == null ? null : asInt(json['salary_min']),
        currency: asString(json['currency']),
        applicationMode: asString(json['application_mode']),
        dailyTarget: json['daily_target'] == null ? null : asInt(json['daily_target']),
        active: asBool(json['active']),
      );
}

/// An uploaded or generated document row (`/api/documents*`).
class CareerDocument {
  CareerDocument({
    required this.id,
    required this.kind,
    this.originalName,
    this.mimeType,
    this.byteSize,
    this.createdAt,
    this.title,
  });

  final String id;
  final String kind;
  final String? originalName;
  final String? mimeType;
  final int? byteSize;
  final DateTime? createdAt;
  final String? title;

  String get label => originalName ?? title ?? kind;

  factory CareerDocument.fromJson(Map<String, dynamic> json) => CareerDocument(
        id: asStringOr(json['id'], ''),
        kind: asStringOr(json['kind'], 'DOCUMENT'),
        originalName: asString(json['original_name']),
        mimeType: asString(json['mime_type']),
        byteSize: json['byte_size'] == null ? null : asInt(json['byte_size']),
        createdAt: asDate(json['created_at']),
        title: asString(json['title']),
      );

  static List<CareerDocument> listFrom(Map<String, dynamic> body) =>
      asMapList(body['documents']).map(CareerDocument.fromJson).toList();
}
