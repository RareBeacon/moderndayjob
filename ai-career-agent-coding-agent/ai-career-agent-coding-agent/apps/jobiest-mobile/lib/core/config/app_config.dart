/// Runtime configuration.
///
/// Nothing here is a secret: the Supabase URL and anon key are public client
/// values that the website already ships to every browser. They are fetched at
/// runtime from `GET /api/mobile/config` so an installed APK always matches the
/// deployed backend, and can be overridden at build time with `--dart-define`.
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    this.supportEmail = defaultSupportEmail,
  });

  final String apiBaseUrl;
  final String supabaseUrl;
  final String supabaseAnonKey;
  final String supportEmail;

  static const String defaultApiBaseUrl = 'https://jobiest.com';
  static const String defaultSupportEmail = 'support@jobiest.com';

  static const String apiOverride = String.fromEnvironment('JOBIEST_API_BASE_URL');
  static const String supabaseUrlOverride = String.fromEnvironment('JOBIEST_SUPABASE_URL');
  static const String supabaseAnonKeyOverride = String.fromEnvironment('JOBIEST_SUPABASE_ANON_KEY');

  /// Configuration present before the remote config round-trip completes.
  static AppConfig bootstrap() => AppConfig(
        apiBaseUrl: apiOverride.isNotEmpty ? apiOverride : defaultApiBaseUrl,
        supabaseUrl: supabaseUrlOverride,
        supabaseAnonKey: supabaseAnonKeyOverride,
      );

  /// True when the auth provider is reachable (remote config fetched, or the
  /// values were compiled in).
  bool get isAuthConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  AppConfig mergeRemote(Map<String, dynamic> json) => AppConfig(
        apiBaseUrl: apiOverride.isNotEmpty
            ? apiOverride
            : _string(json['apiBaseUrl']) ?? apiBaseUrl,
        supabaseUrl: supabaseUrlOverride.isNotEmpty
            ? supabaseUrlOverride
            : _string(json['supabaseUrl']) ?? supabaseUrl,
        supabaseAnonKey: supabaseAnonKeyOverride.isNotEmpty
            ? supabaseAnonKeyOverride
            : _string(json['supabaseAnonKey']) ?? supabaseAnonKey,
        supportEmail: _string(json['supportEmail']) ?? supportEmail,
      );

  static String? _string(Object? value) {
    if (value is String && value.trim().isNotEmpty) return value.trim();
    return null;
  }

  /// Absolute URL for a backend path, e.g. `/api/jobs`.
  Uri apiUri(String path, [Map<String, String>? query]) {
    final base = apiBaseUrl.endsWith('/')
        ? apiBaseUrl.substring(0, apiBaseUrl.length - 1)
        : apiBaseUrl;
    final uri = Uri.parse('$base$path');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: query);
  }

  /// Auth-provider endpoints (Supabase GoTrue REST).
  Uri supabaseUri(String path, [Map<String, String>? query]) {
    final base = supabaseUrl.endsWith('/')
        ? supabaseUrl.substring(0, supabaseUrl.length - 1)
        : supabaseUrl;
    final uri = Uri.parse('$base$path');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: query);
  }

  Map<String, String> get supabaseAnonHeaders => <String, String>{
        'apikey': supabaseAnonKey,
        'Authorization': 'Bearer $supabaseAnonKey',
      };
}
