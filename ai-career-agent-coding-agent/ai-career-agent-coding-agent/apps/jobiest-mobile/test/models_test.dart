import 'package:flutter_test/flutter_test.dart';
import 'package:jobiest_mobile/core/network/api_exception.dart';
import 'package:jobiest_mobile/features/agent/data/agent_repository.dart';
import 'package:jobiest_mobile/models/account.dart';
import 'package:jobiest_mobile/models/application.dart';
import 'package:jobiest_mobile/models/job.dart';
import 'package:jobiest_mobile/models/resume.dart';

void main() {
  group('Job parsing', () {
    test('reads the fields returned by GET /api/jobs', () {
      final jobs = Job.listFrom(<String, dynamic>{
        'jobs': <dynamic>[
          <String, dynamic>{
            'id': '8f0d3f2e-1111-2222-3333-444455556666',
            'source': 'REMOTEOK',
            'company': 'Acme',
            'title': 'Backend Engineer',
            'url': 'https://example.com/jobs/1',
            'location': 'Remote',
            'metadata': <String, dynamic>{'salary': '\$120k'},
            'created_at': '2026-09-01T10:00:00.000Z',
          },
        ],
      });

      expect(jobs, hasLength(1));
      expect(jobs.first.title, 'Backend Engineer');
      expect(jobs.first.company, 'Acme');
      expect(jobs.first.salary, '\$120k');
      expect(jobs.first.isRemote, isTrue);
      expect(jobs.first.sourceLabel, 'RemoteOK');
    });

    test('survives a listing with missing optional fields', () {
      final jobs = Job.listFrom(<String, dynamic>{
        'jobs': <dynamic>[
          <String, dynamic>{'id': 'x', 'source': 'MANUAL', 'company': 'Acme', 'title': 'PM'},
        ],
      });
      expect(jobs.first.location, isNull);
      expect(jobs.first.salary, isNull);
      expect(jobs.first.isRemote, isFalse);
      expect(jobs.first.url, '');
    });
  });

  group('Application parsing', () {
    test('normalizes the nested job object', () {
      final applications = JobApplication.listFrom(<String, dynamic>{
        'applications': <dynamic>[
          <String, dynamic>{
            'id': 'app-1',
            'status': 'SUBMITTED',
            'job_id': 'job-1',
            'submitted_at': '2026-09-10T09:00:00.000Z',
            'job': <String, dynamic>{'company': 'Acme', 'title': 'Backend Engineer'},
          },
        ],
      });

      expect(applications, hasLength(1));
      expect(applications.first.title, 'Backend Engineer');
      expect(applications.first.isActive, isFalse);
    });

    test('flags draft applications as active', () {
      final applications = JobApplication.listFrom(<String, dynamic>{
        'applications': <dynamic>[
          <String, dynamic>{'id': 'app-2', 'status': 'DRAFT'},
        ],
      });
      expect(applications.first.isActive, isTrue);
      expect(applications.first.title, 'Untitled role');
    });
  });

  group('Account models', () {
    test('profile completeness reads the tuple checks', () {
      final completeness = ProfileCompleteness.fromJson(<String, dynamic>{
        'percent': 44,
        'next': <dynamic>['Add a headline'],
        'checks': <dynamic>[
          <dynamic>['name', true, 'Add your name'],
          <dynamic>['headline', false, 'Add a headline'],
        ],
      });
      expect(completeness.percent, 44);
      expect(completeness.checks, hasLength(2));
      expect(completeness.checks.first.done, isTrue);
      expect(completeness.next.first, 'Add a headline');
    });

    test('entitlements default to free when fields are absent', () {
      final entitlements = Entitlements.fromJson(<String, dynamic>{});
      expect(entitlements.planLabel, 'Free');
      expect(entitlements.automationEnabled, isFalse);
      expect(entitlements.aiCreditsRemaining, isNull);
    });

    test('resume draft exposes stored content', () {
      final draft = ResumeDraft.fromBody(<String, dynamic>{
        'draft': <String, dynamic>{
          'id': 'draft-1',
          'completion': 30,
          'content': <String, dynamic>{'fullName': 'Ada Lovelace', 'skills': 'dart, sql'},
          'score': <String, dynamic>{'overall': 72},
        },
      });
      expect(draft, isNotNull);
      expect(draft!.fullName, 'Ada Lovelace');
      expect(draft.skills, 'dart, sql');
      expect(draft.overallScore, 72);
    });
  });

  group('Agent models', () {
    test('match results keep backend strengths and gaps', () {
      final result = MatchResult.fromJson(<String, dynamic>{
        'matches': <dynamic>[
          <String, dynamic>{
            'jobId': 'job-1',
            'company': 'Acme',
            'title': 'Backend Engineer',
            'score': 81,
            'strengths': <dynamic>['postgres', 'ci'],
            'gaps': <dynamic>['kubernetes'],
          },
        ],
        'scoredCount': 4,
        'excludedCount': 2,
        'cappedCount': 1,
        'failures': <dynamic>[
          <String, dynamic>{'jobId': 'job-9', 'error': 'timeout'},
        ],
      });
      expect(result.matches, hasLength(1));
      expect(result.matches.first.score, 81);
      expect(result.matches.first.gaps, <String>['kubernetes']);
      expect(result.failureCount, 1);
      expect(result.isEmpty, isFalse);
    });
  });

  group('Error mapping', () {
    test('maps provider failure codes to honest messages', () {
      final unauthenticated = apiExceptionFromResponse(401, <String, dynamic>{'error': 'UNAUTHENTICATED'});
      expect(unauthenticated.kind, ApiFailureKind.unauthenticated);
      expect(unauthenticated.message, contains('session'));

      final quota = apiExceptionFromResponse(429, <String, dynamic>{'error': 'DAILY_TOOL_USES_EXHAUSTED'});
      expect(quota.kind, ApiFailureKind.quotaExhausted);

      final rate = apiExceptionFromResponse(429, <String, dynamic>{'error': 'RATE_LIMITED'});
      expect(rate.kind, ApiFailureKind.rateLimited);

      final truthfulness = apiExceptionFromResponse(422, <String, dynamic>{'error': 'TRUTHFULNESS_FAILED'});
      expect(truthfulness.message, contains('Nothing was saved'));
    });

    test('prefers the server message over the generic fallback', () {
      final failure = apiExceptionFromResponse(500, <String, dynamic>{
        'error': 'RESUME_GENERATION_FAILED',
        'message': 'My writing assistant took a coffee break.',
      });
      expect(failure.kind, ApiFailureKind.server);
      expect(failure.message, 'My writing assistant took a coffee break.');
      expect(failure.code, 'RESUME_GENERATION_FAILED');
    });
  });
}
