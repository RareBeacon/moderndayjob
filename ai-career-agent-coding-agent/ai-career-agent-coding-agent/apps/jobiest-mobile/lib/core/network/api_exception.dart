/// Failure categories surfaced to the UI. Every one of these maps to a real
/// condition observed from the backend, never to an invented success state.
enum ApiFailureKind {
  offline,
  timeout,
  unauthenticated,
  mfaRequired,
  forbidden,
  rateLimited,
  quotaExhausted,
  validation,
  notFound,
  server,
  unknown,
}

class ApiException implements Exception {
  ApiException(this.kind, this.message, {this.code, this.statusCode});

  final ApiFailureKind kind;
  final String message;
  final String? code;
  final int? statusCode;

  bool get requiresSignIn =>
      kind == ApiFailureKind.unauthenticated || kind == ApiFailureKind.forbidden;

  @override
  String toString() => 'ApiException($kind, $code, $statusCode): $message';
}

/// Backend error code -> human sentence. Codes come from the existing API
/// routes (`app/api/**`); anything unknown falls back to the server message or
/// a neutral sentence, so the UI never claims a success that did not happen.
const Map<String, String> _serverMessages = <String, String>{
  'UNAUTHENTICATED': 'Your session has ended. Please sign in again.',
  'MFA_REQUIRED':
      'Two-factor authentication is required for this account. Confirm the code to continue.',
  'ACCOUNT_SUSPENDED': 'This account is suspended. Contact support for help.',
  'ACCOUNT_TERMINATED': 'This account has been closed.',
  'ACCOUNT_BLOCKED': 'This account cannot perform that action right now.',
  'RATE_LIMITED': 'Too many requests just now. Please wait a moment and retry.',
  'DAILY_AI_CREDITS_EXHAUSTED': 'You have reached your plan limit for AI documents today.',
  'DAILY_TOOL_USES_EXHAUSTED': 'You have reached your plan limit for this tool today.',
  'APPLICATION_QUOTA_EXHAUSTED': 'You have used every application credit on your current plan.',
  'AUTOMATION_NOT_ENTITLED': 'Automated applications need a paid plan.',
  'CAREER_PROFILE_REQUIRED': 'Add your career profile first — the agent needs it to work.',
  'INVALID_BODY': 'That request was not understood. Please check the fields and try again.',
  'VALIDATION_FAILED': 'Some details need fixing before this can be saved.',
  'JOB_NOT_FOUND': 'That job is no longer available.',
  'NOT_FOUND': 'That record no longer exists.',
  'EXPIRED_JOB': 'This job listing has expired.',
  'JOBS_LIST_FAILED': 'Job listings could not be loaded right now.',
  'SAVED_JOBS_FAILED': 'Saved jobs could not be loaded right now.',
  'SAVE_FAILED': 'That job could not be saved.',
  'UNSAVE_FAILED': 'That job could not be removed from your saved list.',
  'PROFILE_UPDATE_FAILED': 'Your profile could not be saved.',
  'PREFERENCES_UPDATE_FAILED': 'Your preferences could not be saved.',
  'RESUME_STUDIO_MIGRATION_REQUIRED':
      'Resume Studio is not available on this deployment yet.',
  'DRAFT_SAVE_FAILED': 'Your draft could not be saved. Your text is still on screen.',
  'RESUME_GENERATION_FAILED': 'The resume writer could not finish. Nothing was saved.',
  'TRUTHFULNESS_FAILED':
      'The draft contained details that are not in your profile. Nothing was saved.',
  'CONTACT_REQUIRED': 'Add your name and email before generating.',
  'AI_MATCH_FAILED': 'Matching is temporarily unavailable. Your credit was not used.',
  'DOCUMENT_LIST_FAILED': 'Your documents could not be loaded.',
  'GENERATED_DOCUMENT_LIST_FAILED': 'Your generated documents could not be loaded.',
  'UPLOAD_FAILED': 'That file could not be uploaded.',
  'PDF_REQUIRED': 'Only PDF files are accepted.',
  'FILE_SIZE_INVALID': 'That file is too large.',
};

ApiException apiExceptionFromResponse(int statusCode, Map<String, dynamic> body) {
  final code = body['error'] is String ? body['error'] as String : null;
  final serverMessage = body['message'] is String ? body['message'] as String : null;
  final friendly = (code != null ? _serverMessages[code] : null) ?? serverMessage;

  switch (statusCode) {
    case 400:
      return ApiException(ApiFailureKind.validation,
          friendly ?? 'That request could not be completed.', code: code, statusCode: statusCode);
    case 401:
      if (code == 'MFA_REQUIRED') {
        return ApiException(ApiFailureKind.mfaRequired,
            friendly ?? 'Two-factor authentication is required.', code: code, statusCode: statusCode);
      }
      return ApiException(ApiFailureKind.unauthenticated,
          friendly ?? 'Please sign in to continue.', code: code, statusCode: statusCode);
    case 403:
      return ApiException(ApiFailureKind.forbidden,
          friendly ?? 'You do not have access to that.', code: code, statusCode: statusCode);
    case 404:
      return ApiException(ApiFailureKind.notFound,
          friendly ?? 'Not found.', code: code, statusCode: statusCode);
    case 409:
      return ApiException(ApiFailureKind.validation,
          friendly ?? 'That conflicts with something that already exists.',
          code: code, statusCode: statusCode);
    case 422:
      return ApiException(ApiFailureKind.validation,
          friendly ?? 'Those details could not be accepted.', code: code, statusCode: statusCode);
    case 429:
      final exhausted = code != null && code.contains('EXHAUSTED');
      return ApiException(
          exhausted ? ApiFailureKind.quotaExhausted : ApiFailureKind.rateLimited,
          friendly ?? 'Too many requests just now.',
          code: code,
          statusCode: statusCode);
    case 503:
      return ApiException(ApiFailureKind.server,
          friendly ?? 'This feature is not available on this deployment yet.',
          code: code, statusCode: statusCode);
    default:
      if (statusCode >= 500) {
        return ApiException(ApiFailureKind.server,
            friendly ?? 'Jobiest had a problem on its side. Please try again.',
            code: code, statusCode: statusCode);
      }
      return ApiException(ApiFailureKind.unknown, friendly ?? 'Something went wrong.',
          code: code, statusCode: statusCode);
  }
}
