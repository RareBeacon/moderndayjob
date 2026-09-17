import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/config/runtime_config.dart';
import 'core/network/api_client.dart';
import 'core/storage/secure_session_store.dart';
import 'features/agent/data/agent_repository.dart';
import 'features/applications/data/applications_repository.dart';
import 'features/auth/data/account_api.dart';
import 'features/auth/data/auth_api.dart';
import 'features/auth/state/auth_controller.dart';
import 'features/jobs/data/jobs_repository.dart';
import 'features/profile/data/profile_repository.dart';
import 'features/resume/data/resume_repository.dart';
import 'features/support/data/support_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final bootstrap = AppConfig.bootstrap();
  final config = await RuntimeConfig.load(bootstrap);

  final auth = AuthController(
    authApi: AuthApi(config: config),
    accountApi: AccountApi(config: config),
    store: SecureSessionStore(),
  );

  final api = ApiClient(
    config: config,
    tokenProvider: auth.currentToken,
    recoverSession: auth.recoverSession,
  );

  final dependencies = JobiestDependencies(
    config: config,
    auth: auth,
    api: api,
    jobs: JobsRepository(api),
    applications: ApplicationsRepository(api),
    agent: AgentRepository(api),
    profile: ProfileRepository(api),
    resume: ResumeRepository(api),
    support: SupportRepository(api),
  );

  // Session restore runs while the splash is on screen.
  unawaited(auth.bootstrap());

  runApp(JobiestApp(dependencies: dependencies));
}
