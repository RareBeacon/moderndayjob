import '../../../core/network/api_client.dart';
import '../../../models/json.dart';

/// The exact categories the backend support route accepts.
const List<String> supportCategories = <String>[
  'Account & Login',
  'Jobs',
  'CV & Resume',
  'Applications',
  'AI Agent',
  'Payments & Subscription',
  'Technical Issue',
  'Other',
];

class SupportResult {
  SupportResult({required this.delivered, required this.message});

  /// True only when the backend confirms the message actually reached the
  /// support inbox. Never assumed by the app.
  final bool delivered;
  final String message;
}

class SupportRepository {
  SupportRepository(this._api);

  final ApiClient _api;

  Future<SupportResult> send({
    required String email,
    required String category,
    required String subject,
    required String message,
  }) async {
    final body = await _api.postJson('/api/support', body: <String, dynamic>{
      'email': email,
      'category': category,
      'subject': subject,
      'message': message,
    });
    return SupportResult(
      delivered: asBool(body['delivered']),
      message: asStringOr(
        body['message'],
        'Your message was received.',
      ),
    );
  }
}
