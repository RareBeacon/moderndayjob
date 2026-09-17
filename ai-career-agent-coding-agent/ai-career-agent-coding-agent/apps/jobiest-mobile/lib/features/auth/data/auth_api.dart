import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../../core/config/app_config.dart';
import '../../../core/network/api_exception.dart';

class AuthTokens {
  AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
    required this.userId,
    required this.email,
    this.factors = const <MfaFactor>[],
  });

  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;
  final String userId;
  final String email;
  final List<MfaFactor> factors;

  bool get isAal2 => jwtClaim(accessToken, 'aal') == 'aal2';

  /// True when the provider has enrolled a verified factor and this session
  /// has not completed it yet — the same rule the backend applies in
  /// `lib/auth.ts` (claim present + `aal1` -> MFA_REQUIRED).
  bool get needsSecondFactor =>
      hasJwtClaim(accessToken, 'aal') && !isAal2;

  MfaFactor? get verifiedFactor {
    for (final factor in factors) {
      if (factor.status == 'verified') return factor;
    }
    return null;
  }
}

class MfaFactor {
  MfaFactor({required this.id, required this.friendlyName, required this.status, required this.factorType});

  final String id;
  final String friendlyName;
  final String status;
  final String factorType;

  bool get isVerified => status == 'verified';

  factory MfaFactor.fromJson(Map<String, dynamic> json) => MfaFactor(
        id: (json['id'] ?? '') as String? ?? '',
        friendlyName: (json['friendly_name'] ?? 'Authenticator app') as String? ?? 'Authenticator app',
        status: (json['status'] ?? 'unverified') as String? ?? 'unverified',
        factorType: (json['factor_type'] ?? 'totp') as String? ?? 'totp',
      );
}

class TotpEnrollment {
  TotpEnrollment({required this.factorId, required this.secret, required this.uri});

  final String factorId;
  final String secret;
  final String uri;
}

/// Decodes a JWT payload without verifying it. Verification is always the
/// server's job (GoTrue / the backend's admin API); this is only used to decide
/// which screen to show.
Map<String, dynamic> _jwtPayload(String token) {
  try {
    final parts = token.split('.');
    if (parts.length < 2) return <String, dynamic>{};
    final normalized = base64Url.normalize(parts[1]);
    final decoded = utf8.decode(base64Url.decode(normalized));
    final json = jsonDecode(decoded);
    return json is Map<String, dynamic> ? json : <String, dynamic>{};
  } catch (_) {
    return <String, dynamic>{};
  }
}

Object? jwtClaim(String token, String key) => _jwtPayload(token)[key];

bool hasJwtClaim(String token, String key) => _jwtPayload(token).containsKey(key);

/// Direct client for the auth provider's REST API (Supabase GoTrue) plus the
/// two public Jobiest auth endpoints. Implemented over `http` so the app has
/// no provider SDK to keep in lockstep with.
class AuthApi {
  AuthApi({required AppConfig config, http.Client? client})
      : _config = config,
        _http = client ?? http.Client();

  final AppConfig _config;
  final http.Client _http;
  static const Duration _timeout = Duration(seconds: 25);

  Future<Map<String, dynamic>> _authRequest(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    String? accessToken,
  }) async {
    if (!_config.isAuthConfigured) {
      throw ApiException(ApiFailureKind.server,
          'Jobiest could not be reached to configure sign-in. Check your connection and retry.');
    }
    final uri = _config.supabaseUri(path, query);
    final request = http.Request(method, uri)
      ..headers.addAll(<String, String>{
        'apikey': _config.supabaseAnonKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (accessToken != null && accessToken.isNotEmpty)
          'Authorization': 'Bearer $accessToken',
      });
    if (body != null) request.body = jsonEncode(body);

    http.Response response;
    try {
      final streamed = await _http.send(request).timeout(_timeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException(ApiFailureKind.timeout, 'Sign-in took too long. Please try again.');
    } on SocketException {
      throw ApiException(ApiFailureKind.offline, 'No internet connection.');
    } on http.ClientException {
      throw ApiException(ApiFailureKind.offline, 'No internet connection.');
    }

    final decoded = _decodeMap(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) return decoded;
    throw _authError(response.statusCode, decoded);
  }

  ApiException _authError(int status, Map<String, dynamic> body) {
    final message = _providerMessage(body);
    if (status == 400 || status == 401) {
      return ApiException(ApiFailureKind.unauthenticated,
          message ?? 'That email and password combination did not work.', statusCode: status);
    }
    if (status == 422) {
      return ApiException(ApiFailureKind.validation,
          message ?? 'That email cannot be used. Try another one.', statusCode: status);
    }
    if (status == 429) {
      return ApiException(ApiFailureKind.rateLimited,
          message ?? 'Too many attempts. Please wait a minute and try again.', statusCode: status);
    }
    return ApiException(ApiFailureKind.server,
        message ?? 'Sign-in is temporarily unavailable.', statusCode: status);
  }

  /// GoTrue reports errors as `error_description`/`msg`/`message`.
  String? _providerMessage(Map<String, dynamic> body) {
    for (final key in <String>['error_description', 'msg', 'message', 'error']) {
      final value = body[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
    }
    return null;
  }

  Map<String, dynamic> _decodeMap(String raw) {
    if (raw.isEmpty) return <String, dynamic>{};
    try {
      final value = jsonDecode(raw);
      return value is Map<String, dynamic> ? value : <String, dynamic>{};
    } on FormatException {
      return <String, dynamic>{};
    }
  }

  AuthTokens _tokensFrom(Map<String, dynamic> json) {
    final access = json['access_token'];
    final refresh = json['refresh_token'];
    if (access is! String || refresh is! String) {
      throw ApiException(ApiFailureKind.server, 'The sign-in response was incomplete.');
    }
    final user = json['user'] is Map<String, dynamic>
        ? json['user'] as Map<String, dynamic>
        : <String, dynamic>{};
    final expiresAt = _expiry(json);
    final rawFactors = user['factors'];
    final factors = <MfaFactor>[];
    if (rawFactors is List) {
      for (final entry in rawFactors) {
        if (entry is Map<String, dynamic>) factors.add(MfaFactor.fromJson(entry));
      }
    }
    return AuthTokens(
      accessToken: access,
      refreshToken: refresh,
      expiresAt: expiresAt,
      userId: (user['id'] ?? '') as String? ?? '',
      email: (user['email'] ?? '') as String? ?? '',
      factors: factors,
    );
  }

  DateTime _expiry(Map<String, dynamic> json) {
    final epoch = json['expires_at'];
    if (epoch is num) {
      return DateTime.fromMillisecondsSinceEpoch(epoch.toInt() * 1000, isUtc: true);
    }
    final seconds = json['expires_in'];
    if (seconds is num) {
      return DateTime.now().toUtc().add(Duration(seconds: seconds.toInt()));
    }
    return DateTime.now().toUtc().add(const Duration(hours: 1));
  }

  Future<AuthTokens> signInWithPassword(String email, String password) async {
    final json = await _authRequest(
      'POST',
      '/auth/v1/token',
      query: <String, String>{'grant_type': 'password'},
      body: <String, String>{'email': email, 'password': password},
    );
    return _tokensFrom(json);
  }

  Future<AuthTokens> refresh(String refreshToken) async {
    final json = await _authRequest(
      'POST',
      '/auth/v1/token',
      query: <String, String>{'grant_type': 'refresh_token'},
      body: <String, String>{'refresh_token': refreshToken},
    );
    return _tokensFrom(json);
  }

  /// Revokes the refresh token server-side. A failure here is reported to the
  /// caller so the UI can be honest about whether the session really ended.
  Future<void> revokeSession(String accessToken) async {
    if (accessToken.isEmpty) return;
    await _authRequest('POST', '/auth/v1/logout', accessToken: accessToken);
  }

  Future<List<MfaFactor>> factorsFor(String accessToken) async {
    final json = await _authRequest('GET', '/auth/v1/user', accessToken: accessToken);
    final raw = json['factors'];
    final factors = <MfaFactor>[];
    if (raw is List) {
      for (final entry in raw) {
        if (entry is Map<String, dynamic>) factors.add(MfaFactor.fromJson(entry));
      }
    }
    return factors;
  }

  /// Starts (or restarts) a TOTP challenge for a verified factor.
  Future<String> challengeFactor(String accessToken, String factorId) async {
    final json = await _authRequest('POST', '/auth/v1/factors/$factorId/challenge',
        accessToken: accessToken, body: const <String, String>{});
    final id = json['id'];
    if (id is! String || id.isEmpty) {
      throw ApiException(ApiFailureKind.server, 'The authenticator challenge could not be started.');
    }
    return id;
  }

  Future<AuthTokens> verifyFactor(
    String accessToken,
    String factorId,
    String challengeId,
    String code,
  ) async {
    final json = await _authRequest(
      'POST',
      '/auth/v1/factors/$factorId/verify',
      accessToken: accessToken,
      body: <String, String>{'challenge_id': challengeId, 'code': code},
    );
    return _tokensFrom(json);
  }

  /// Begins TOTP enrolment. The returned secret is shown to the user for
  /// manual entry into any standard authenticator app (Google Authenticator,
  /// Microsoft Authenticator, …). The factor is only active after
  /// [verifyFactor] succeeds.
  Future<TotpEnrollment> enrollTotp(String accessToken, String friendlyName) async {
    final json = await _authRequest(
      'POST',
      '/auth/v1/factors',
      accessToken: accessToken,
      body: <String, String>{'factor_type': 'totp', 'friendly_name': friendlyName},
    );
    final id = json['id'];
    final totp = json['totp'];
    final secret = totp is Map<String, dynamic> ? totp['secret'] : null;
    final uri = totp is Map<String, dynamic> ? totp['uri'] : null;
    if (id is! String || secret is! String) {
      throw ApiException(ApiFailureKind.server, 'Authenticator setup could not be started.');
    }
    return TotpEnrollment(factorId: id, secret: secret, uri: uri is String ? uri : '');
  }

  Future<void> unenroll(String accessToken, String factorId) async {
    await _authRequest('DELETE', '/auth/v1/factors/$factorId', accessToken: accessToken);
  }

  /// Changes the password for the signed-in account. The provider enforces its
  /// own password policy and returns a real error, which the UI shows as-is.
  Future<void> updatePassword(String accessToken, String newPassword) async {
    await _authRequest(
      'PUT',
      '/auth/v1/user',
      accessToken: accessToken,
      body: <String, String>{'password': newPassword},
    );
  }
}
