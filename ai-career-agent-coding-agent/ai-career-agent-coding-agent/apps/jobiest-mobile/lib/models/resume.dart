import 'json.dart';

/// `GET /api/resume-studio/draft` — the active draft, if the user has one.
class ResumeDraft {
  ResumeDraft({
    this.id,
    this.name,
    this.selectedTemplate,
    this.currentStep,
    this.targetJobDescription = '',
    this.content = const <String, dynamic>{},
    this.score = const <String, dynamic>{},
    this.completion = 0,
    this.updatedAt,
  });

  final String? id;
  final String? name;
  final String? selectedTemplate;
  final String? currentStep;
  final String targetJobDescription;
  final Map<String, dynamic> content;
  final Map<String, dynamic> score;
  final int completion;
  final DateTime? updatedAt;

  bool get exists => id != null;

  String get fullName => asStringOr(content['fullName'] ?? content['full_name'], '');
  String get email => asStringOr(content['email'], '');
  String get headline => asStringOr(content['headline'], '');
  String get summary => asStringOr(content['summary'], '');
  String get skills => asStringOr(content['skills'] ?? content['coreSkills'], '');

  /// The stored score object is a map; surface an overall number when present.
  int? get overallScore {
    for (final key in <String>['overall', 'total', 'score', 'atsScore']) {
      final value = score[key];
      if (value is num) return value.toInt();
    }
    return null;
  }

  ResumeDraft copyWith({
    String? name,
    String? targetJobDescription,
    Map<String, dynamic>? content,
  }) =>
      ResumeDraft(
        id: id,
        name: name ?? this.name,
        selectedTemplate: selectedTemplate,
        currentStep: currentStep,
        targetJobDescription: targetJobDescription ?? this.targetJobDescription,
        content: content ?? this.content,
        score: score,
        completion: completion,
        updatedAt: updatedAt,
      );

  factory ResumeDraft.fromJson(Map<String, dynamic> json) => ResumeDraft(
        id: asString(json['id']),
        name: asString(json['name']),
        selectedTemplate: asString(json['selectedTemplate']),
        currentStep: asString(json['currentStep']),
        targetJobDescription: asStringOr(json['targetJobDescription'], ''),
        content: asMap(json['content']),
        score: asMap(json['score']),
        completion: asInt(json['completion']),
        updatedAt: asDate(json['updatedAt']),
      );

  static ResumeDraft? fromBody(Map<String, dynamic> body) {
    final draft = body['draft'];
    if (draft is Map<String, dynamic>) return ResumeDraft.fromJson(draft);
    return null;
  }
}

/// An ATS scan report from `POST /api/ats/scan` (deterministic checks).
class AtsReport {
  AtsReport({this.score, this.findings = const <String>[], this.raw = const <String, dynamic>{}});

  final int? score;
  final List<String> findings;
  final Map<String, dynamic> raw;

  /// The route returns a deterministic report; keep every field available and
  /// surface the ones the UI can show without guessing.
  factory AtsReport.fromJson(Map<String, dynamic> json) {
    final findings = <String>[];
    final issues = json['issues'] ?? json['findings'] ?? json['recommendations'];
    if (issues is List) {
      for (final item in issues) {
        if (item is String) {
          findings.add(item);
        } else if (item is Map<String, dynamic>) {
          final text = asString(item['message'] ?? item['label'] ?? item['issue']);
          if (text != null) findings.add(text);
        }
      }
    }
    int? score;
    final rawScore = json['score'] ?? json['atsScore'] ?? json['total'];
    if (rawScore is num) score = rawScore.toInt();
    return AtsReport(score: score, findings: findings, raw: json);
  }
}
