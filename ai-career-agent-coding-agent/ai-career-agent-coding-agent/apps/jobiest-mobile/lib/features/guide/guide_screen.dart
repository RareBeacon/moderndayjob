import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

/// Getting-started guide. Every step describes behaviour that exists in the
/// product today — nothing aspirational is listed as if it were live.
class GuideScreen extends StatelessWidget {
  const GuideScreen({super.key});

  static const List<_Step> _steps = <_Step>[
    _Step(
      title: '1 · Create and confirm your account',
      body:
          'Sign up with an email address and a password of at least 8 characters. Jobiest accounts are '
          'active immediately — there is no separate email-confirmation step. A welcome message from '
          'philip@jobiest.com arrives shortly after, and transactional mail (including password resets) '
          'comes from no-reply@jobiest.com.',
    ),
    _Step(
      title: '2 · Complete your profile',
      body:
          'Profile → Edit profile. Add your name, one to six target roles, a headline, a professional '
          'summary and your skills. The readiness score on Career Score is computed from exactly these '
          'fields, so each one you add moves it.',
    ),
    _Step(
      title: '3 · Create your CV',
      body:
          'Profile → Resume Studio edits the same draft the website uses: name, headline, summary, skills '
          'and a target job description. Save writes to your account, and the assistant chips ask the '
          'backend for suggestions on the section you are working on.',
    ),
    _Step(
      title: '4 · Understand Career Score',
      body:
          'Career Score shows two real, server-computed signals: profile readiness (name, roles, headline, '
          'summary, skills, experience, education, portfolio, uploaded CV) and a deterministic resume '
          'structure scan. The scan checks parseability and keyword overlap — it is not an AI opinion of you.',
    ),
    _Step(
      title: '5 · Set your job preferences',
      body:
          'Profile → Job preferences. Remote types, locations, employment types and a salary floor are '
          'applied by the matching engine before it scores listings, so the agent only proposes roles that '
          'fit.',
    ),
    _Step(
      title: '6 · Discover jobs',
      body:
          'The Jobs tab lists live listings from the Jobiest pool, newest first, with the original source '
          'and link preserved. Search, filter by location or remote, bookmark roles, and open the original '
          'posting to apply.',
    ),
    _Step(
      title: '7 · Use the AI Agent',
      body:
          'The AI Agent tab runs real backend capabilities: matching against your profile, interview '
          'questions from a job description you paste, pay signals quoted from listings that state pay, and '
          'career-path suggestions based on your verified skills. Daily limits come from your plan and are '
          'reported honestly.',
    ),
    _Step(
      title: '8 · Track applications',
      body:
          'Applications collects every role you track: open a job and tap "Track this application" after you '
          'apply on the employer\u2019s site, or add one manually with the + button. Statuses, prepared '
          'packages and withdrawals are stored in your account.',
    ),
    _Step(
      title: '9 · Secure your account',
      body:
          'Profile → Security lets you change your password and enrol a TOTP authenticator app (Google '
          'Authenticator, Microsoft Authenticator, 1Password). Once enrolled, sign-in asks for a 6-digit '
          'code — on the website as well, because it is the same provider-backed factor.',
    ),
    _Step(
      title: '10 · Get help',
      body:
          'Profile → Contact support sends a message straight to the support team and stores it in your '
          'account. You can also email support@jobiest.com directly.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Getting started')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
        children: <Widget>[
          const Text(
            'How Jobiest works',
            style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          const Text(
            'Ten steps through the platform, in the order most people use it.',
            style: TextStyle(color: BrandColors.muted, height: 1.45),
          ),
          const SizedBox(height: 18),
          ..._steps.map(
            (step) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                color: BrandColors.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: BrandColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(step.title,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 6),
                  Text(step.body,
                      style: const TextStyle(color: BrandColors.muted, height: 1.5)),
                ],
              ),
            ),
          ),
          const InfoBanner(
            message:
                'Anything shown here runs on the live Jobiest backend. If a capability is limited by your '
                'plan, the app says so instead of hiding it.',
          ),
        ],
      ),
    );
  }
}

class _Step {
  const _Step({required this.title, required this.body});

  final String title;
  final String body;
}
