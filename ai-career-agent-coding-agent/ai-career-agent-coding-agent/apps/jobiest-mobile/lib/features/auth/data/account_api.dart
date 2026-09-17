import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../../core/config/app_config.dart';
import '../../../core/network/api_exception.dart';

/// The two public (unauthenticated) account endpoints on the Jobiest backend.
/// They are called directly rather than through [ApiClient] because they must
/// work while signed out, and because they carry the backend's real abuse
/// controls (rate limits, device risk scoring, welcome email).
class AccountApi {
  AccountApi({required AppConfig config, http.Client? client})
      : _config = config,
        _http = client ?? http.Client();

  final AppConfig _config;
  final http.Client _http;

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final request = http.Request('POST', _config.apiUri(path))
      ..headers.addAll(<String, String>{
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Client': 'jobiest-android',
      })
      ..body = jsonEncode(body);

    http.Response response;
    try {
      final streamed = await _http.send(request).timeout(const Duration(seconds: 25));
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException(ApiFailureKind.timeout, 'The request took too long. Please try again.');
    } on SocketException {
      throw ApiException(ApiFailureKind.offline, 'No internet connection.');
    } on http.ClientException {
      throw ApiException(ApiFailureKind.offline, 'No internet connection.');
    }

    Map<String, dynamic> decoded = <String, dynamic>{};
    if (response.body.isNotEmpty) {
      try {
        final value = jsonDecode(response.body);
        if (value is Map<String, dynamic>) decoded = value;
      } on FormatException {
        decoded = <String, dynamic>{};
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) return decoded;
    throw apiExceptionFromResponse(response.statusCode, decoded);
  }

  /// Creates an account through the existing backend route. That route applies
  /// rate limits and device risk scoring and sends the branded welcome email
  /// once. It does not return a session, so the caller signs in afterwards.
  Future<void> register({required String email, required String password}) async {
    await _post('/api/auth/signup', <String, dynamic>{
      'email': email,
      'password': password,
      'attribution': <String, String>{'source': 'android'},
    });
  }

  /// Requests a password-reset email. The backend answers identically whether
  /// or not the address exists, and so does the app.
  Future<void> requestPasswordReset(String email) async {
    await _post('/api/auth/forgot-password', <String, dynamic>{'email': email});
  }
}
