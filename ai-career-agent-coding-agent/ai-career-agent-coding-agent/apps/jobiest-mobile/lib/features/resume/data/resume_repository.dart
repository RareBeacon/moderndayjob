import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../models/json.dart';
import '../../../models/resume.dart';

class ResumeLoadResult {
  ResumeLoadResult({this.draft, this.careerProfileRequired = false});

  final ResumeDraft? draft;

  /// The backend answers 503 `RESUME_STUDIO_MIGRATION_REQUIRED` when the
  /// deployment has not applied the Resume Studio migration. Surfaced as a
  /// real state instead of an empty screen.
  final bool careerProfileRequired;
}

/// Resume Studio against the existing routes. The draft lives on the server;
/// the app never keeps a private copy that could drift from it.
class ResumeRepository {
  ResumeRepository(this._api);

  final ApiClient _api;

  Future<ResumeDraft?> loadDraft() async {
    try {
      final body = await _api.getJson('/api/resume-studio/draft');
      return ResumeDraft.fromBody(body);
    } on ApiException catch (error) {
      if (error.code == 'RESUME_STUDIO_MIGRATION_REQUIRED') return null;
      rethrow;
    }
  }

  /// Saves the draft and returns the recalculated draft (the route answers with
  /// `{draft, score, completion}`).
  Future<ResumeDraft?> saveDraft(ResumeDraft draft) async {
    final body = await _api.putJson('/api/resume-studio/draft', body: <String, dynamic>{
      if (draft.id != null) 'id': draft.id,
      if (draft.name != null) 'name': draft.name,
      if (draft.selectedTemplate != null) 'selectedTemplate': draft.selectedTemplate,
      if (draft.currentStep != null) 'currentStep': draft.currentStep,
      'targetJobDescription': draft.targetJobDescription,
      'content': draft.content,
    });
    final saved = ResumeDraft.fromBody(body);
    if (saved != null) return saved;
    final updated = asMap(body['draft']);
    return updated.isEmpty ? draft : ResumeDraft.fromJson(updated);
  }

  /// The assistant actions the backend accepts
  /// (`POST /api/resume-studio/ai`, schema `body` in that route).
  static const List<String> actions = <String>[
    'suggestSkills',
    'writeSummary',
    'generateExperience',
    'improveExperience',
    'analyzeResume',
    'optimizeForJob',
    'recommendTemplate',
    'extractProfile',
    'finalReview',
  ];

  /// Asks the backend's Resume Studio assistant for help. The response is
  /// returned exactly as produced (the device never invents a suggestion).
  Future<Map<String, dynamic>> assist({
    required String action,
    Map<String, dynamic>? draft,
    String? role,
    List<String>? existing,
    Map<String, dynamic>? experience,
    List<String>? bullets,
    String? mode,
    String? seniority,
    String? jobDescription,
    String? text,
  }) async {
    assert(actions.contains(action), 'Unknown resume assistant action: $action');
    return _api.postJson('/api/resume-studio/ai', body: <String, dynamic>{
      'action': action,
      if (draft != null) 'draft': draft,
      if (role != null && role.trim().isNotEmpty) 'role': role.trim(),
      if (existing != null) 'existing': existing,
      if (experience != null) 'experience': experience,
      if (bullets != null) 'bullets': bullets,
      if (mode != null) 'mode': mode,
      if (seniority != null) 'seniority': seniority,
      if (jobDescription != null && jobDescription.trim().isNotEmpty)
        'jobDescription': jobDescription,
      if (text != null && text.trim().isNotEmpty) 'text': text,
    });
  }
}
