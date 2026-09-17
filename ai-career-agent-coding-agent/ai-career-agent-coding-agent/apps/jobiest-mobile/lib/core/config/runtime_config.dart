import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'app_config.dart';

/// Fetches the public mobile configuration from the backend so an installed
/// APK always points at the deployed Supabase project without baking any
/// environment into the build.
///
/// A failure here is never fatal: the app falls back to the `--dart-define`
/// values (or to `https://jobiest.com`) and the sign-in screen reports that the
/// service could not be reached.
class RuntimeConfig {
  static Future<AppConfig> load(AppConfig bootstrap, {http.Client? client}) async {
    final httpClient = client ?? http.Client();
    try {
      final response = await httpClient
          .get(
            bootstrap.apiUri('/api/mobile/config'),
            headers: const <String, String>{'Accept': 'application/json'},
          )
          .timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) return bootstrap;
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) return bootstrap;
      return bootstrap.mergeRemote(decoded);
    } on TimeoutException {
      return bootstrap;
    } on SocketException {
      return bootstrap;
    } on http.ClientException {
      return bootstrap;
    } on FormatException {
      return bootstrap;
    } finally {
      if (client == null) httpClient.close();
    }
  }
}
