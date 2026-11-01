import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { supabaseAdmin } from '@/lib/supabase';
import type { AssessmentRoute } from '@/lib/talent-pool/constants';
import {
  evaluateCandidateReadiness,
  type CandidateSnapshotData,
} from '@/lib/talent-pool/onboarding-inspector';
import {
  detectProfileAndCvContradictions,
  extractStructuredFactsFromCvText,
} from './data-completion-gate';
import {
  ingestCandidateSnapshotIntoRag,
  JobiestIsolatedLangChainRetriever,
  type RetrievedEvidence,
} from './rag-engine';
import {
  runCandidateProfileIntelligenceAnalyst,
  type CandidateIntelligenceAnalysis,
} from './prompts/prompt-a-analyst';
import {
  runPersonalizedInterviewBlueprintArchitect,
  type InterviewBlueprint,
} from './prompts/prompt-b-architect';
import {
  validateAndRepairInterviewBlueprint,
  type QuestionQualityValidationReport,
} from './question-quality-gate';
import {
  buildInterviewerOpeningGreeting,
  runRealtimeInterviewerTurn,
  type InterviewerTurnResponse,
} from './prompts/prompt-c-interviewer';
import {
  buildComprehensiveAssessmentReportAO,
  runIndependentAssessmentEvaluator,
  type ComprehensiveAdminAssessmentReport,
  type IndependentAssessmentEvaluation,
  type RecordedAnswerInput,
} from './prompts/prompt-d-evaluator';
import {
  summarizeTelemetry,
  type IntelligenceCallTelemetry,
  type InterviewTelemetrySummary,
} from './cost-tracker';

export const LANGGRAPH_WORKFLOW_NODES = [
  'LOAD_CANDIDATE_PROFILE',
  'VALIDATE_PROFILE_COMPLETENESS',
  'INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS',
  'RETRIEVE_CANDIDATE_CONTEXT',
  'RETRIEVE_ROLE_COMPETENCIES',
  'ANALYZE_CANDIDATE',
  'GENERATE_INTERVIEW_BLUEPRINT',
  'VALIDATE_QUESTION_QUALITY',
  'CREATE_INTERVIEW_SESSION',
  'CONDUCT_INTERVIEW',
  'TRANSCRIBE_RESPONSES',
  'GENERATE_ADAPTIVE_FOLLOW_UP',
  'VALIDATE_INTERVIEW_COMPLETION',
  'EVALUATE_RESPONSES',
  'GENERATE_ASSESSMENT_REPORT',
  'SUBMIT_FOR_HUMAN_REVIEW',
] as const;

export type WorkflowNodeName = (typeof LANGGRAPH_WORKFLOW_NODES)[number];

export type WorkflowExecutionPhase =
  | 'PREPARE_SESSION'
  | 'CONDUCT_TURN'
  | 'FINALIZE_AND_SUBMIT'
  | 'FULL_PIPELINE';

export type WorkflowLifecycleStatus =
  | 'RUNNING'
  | 'AWAITING_CANDIDATE_CONFIRMATION'
  | 'AWAITING_CANDIDATE_ANSWER'
  | 'PAUSED_INTERRUPTION'
  | 'COMPLETED'
  | 'FAILED';

export interface IncomingTurnPayload {
  questionId: string;
  rawTranscript: string;
  modality: 'VOICE' | 'WRITTEN';
  durationSeconds: number;
  sttConfidence?: number | null;
  interrupted?: boolean;
  interruptionReason?: string;
}

export const InterviewGraphAnnotation = Annotation.Root({
  threadId: Annotation<string>(),
  idempotencyKey: Annotation<string>(),
  phase: Annotation<WorkflowExecutionPhase>(),
  candidateId: Annotation<string>(),
  applicationId: Annotation<string>(),
  sessionId: Annotation<string>(),
  assessmentRoute: Annotation<AssessmentRoute>(),
  snapshot: Annotation<CandidateSnapshotData | null>(),
  cvExtractedText: Annotation<string | null>(),
  candidateConfirmedDiscrepancies: Annotation<boolean>(),
  targetQuestionCount: Annotation<number | undefined>(),
  persistToDatabase: Annotation<boolean>(),

  // Tracking & workflow memory
  currentNode: Annotation<WorkflowNodeName>(),
  completedNodes: Annotation<WorkflowNodeName[]>({
    reducer: (prev, next) => Array.from(new Set([...(prev ?? []), ...(next ?? [])])),
    default: () => [],
  }),
  workflowStatus: Annotation<WorkflowLifecycleStatus>(),
  errorCode: Annotation<string | null>(),
  interruptionReason: Annotation<string | null>(),

  // Step 2..8 artifacts
  completenessScore: Annotation<number>(),
  missingRequiredFields: Annotation<string[]>(),
  contradictionsCount: Annotation<number>(),
  candidateRagHits: Annotation<RetrievedEvidence[]>(),
  roleRagHits: Annotation<RetrievedEvidence[]>(),
  candidateAnalysis: Annotation<CandidateIntelligenceAnalysis | null>(),
  interviewBlueprint: Annotation<InterviewBlueprint | null>(),
  qualityReport: Annotation<QuestionQualityValidationReport | null>(),
  openingGreeting: Annotation<string | null>(),

  // Step 9..12 live interview state
  currentQuestionIndex: Annotation<number>(),
  completedQuestionIds: Annotation<string[]>({
    reducer: (prev, next) => Array.from(new Set([...(prev ?? []), ...(next ?? [])])),
    default: () => [],
  }),
  answers: Annotation<RecordedAnswerInput[]>(),
  followupCountsByQuestion: Annotation<Record<string, number>>(),
  technicalInterruptions: Annotation<string[]>({
    reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
    default: () => [],
  }),
  incomingTurn: Annotation<IncomingTurnPayload | null>(),
  latestTurnResponse: Annotation<InterviewerTurnResponse | null>(),

  // Step 13..16 evaluation & human-review submission artifacts
  evaluation: Annotation<IndependentAssessmentEvaluation | null>(),
  comprehensiveReport: Annotation<ComprehensiveAdminAssessmentReport | null>(),
  submittedForHumanReview: Annotation<boolean>(),
  submissionReceiptId: Annotation<string | null>(),

  // Cost & latency telemetry
  telemetryCalls: Annotation<IntelligenceCallTelemetry[]>({
    reducer: (prev, next) => [...(prev ?? []), ...(next ?? [])],
    default: () => [],
  }),
});

export type InterviewGraphState = typeof InterviewGraphAnnotation.State;

const sharedMemoryCheckpointer = new MemorySaver();
const completedIdempotencyReceipts = new Map<string, InterviewGraphState>();

async function persistCheckpointBestEffort(state: Partial<InterviewGraphState> & { threadId: string; candidateId: string }) {
  if (!state.persistToDatabase) return;
  try {
    const summary = summarizeTelemetry(state.telemetryCalls ?? []);
    await supabaseAdmin.from('talent_workflow_checkpoints').upsert(
      {
        thread_id: state.threadId,
        user_id: state.candidateId,
        application_id: state.applicationId || null,
        session_id: state.sessionId || null,
        idempotency_key: state.idempotencyKey || state.threadId,
        current_node: state.currentNode ?? 'LOAD_CANDIDATE_PROFILE',
        completed_nodes: state.completedNodes ?? [],
        workflow_status: state.workflowStatus ?? 'RUNNING',
        state_json: {
          currentQuestionIndex: state.currentQuestionIndex ?? 0,
          completedQuestionIds: state.completedQuestionIds ?? [],
          answersCount: state.answers?.length ?? 0,
          submittedForHumanReview: Boolean(state.submittedForHumanReview),
        },
        interruption_reason: state.interruptionReason ?? null,
        error_code: state.errorCode ?? null,
        total_input_tokens: summary.totalInputTokens,
        total_output_tokens: summary.totalOutputTokens,
        estimated_cost_usd: summary.estimatedCostUsd,
        total_latency_ms: summary.totalLatencyMs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'thread_id' },
    );
  } catch {
    // Non-blocking if migration 051 has not been applied yet
  }
}

export function buildJobiestInterviewLangGraph() {
  const workflow = new StateGraph(InterviewGraphAnnotation)
    // 1. LOAD_CANDIDATE_PROFILE
    .addNode('LOAD_CANDIDATE_PROFILE', async (state) => {
      if (!state.snapshot) {
        return {
          currentNode: 'LOAD_CANDIDATE_PROFILE' as const,
          workflowStatus: 'FAILED' as const,
          errorCode: 'MISSING_CANDIDATE_SNAPSHOT',
        };
      }
      return {
        currentNode: 'LOAD_CANDIDATE_PROFILE' as const,
        completedNodes: ['LOAD_CANDIDATE_PROFILE' as const],
        workflowStatus: 'RUNNING' as const,
        errorCode: null,
      };
    })
    // 2. VALIDATE_PROFILE_COMPLETENESS
    .addNode('VALIDATE_PROFILE_COMPLETENESS', async (state) => {
      const snapshot = state.snapshot!;
      const readiness = evaluateCandidateReadiness({
        snapshot,
        masterCvDocumentId: snapshot.master_cv_present ? 'present' : null,
        portfolioId: snapshot.hosted_portfolio_slug,
      });
      const cvFacts = extractStructuredFactsFromCvText(state.cvExtractedText);
      const contradictions = detectProfileAndCvContradictions(snapshot, cvFacts);
      const blockingContradictions = contradictions.filter((c) => c.requires_candidate_clarification);

      if (
        !readiness.readyToApply ||
        (blockingContradictions.length > 0 && !state.candidateConfirmedDiscrepancies)
      ) {
        return {
          currentNode: 'VALIDATE_PROFILE_COMPLETENESS' as const,
          completedNodes: ['VALIDATE_PROFILE_COMPLETENESS' as const],
          completenessScore: readiness.completenessScore,
          missingRequiredFields: readiness.missingRequired.map((f) => f.key),
          contradictionsCount: blockingContradictions.length,
          workflowStatus: 'AWAITING_CANDIDATE_CONFIRMATION' as const,
          errorCode: !readiness.readyToApply
            ? 'PROFILE_INCOMPLETE_CLARIFICATION_REQUIRED'
            : 'CV_CONTRADICTION_CONFIRMATION_REQUIRED',
        };
      }

      return {
        currentNode: 'VALIDATE_PROFILE_COMPLETENESS' as const,
        completedNodes: ['VALIDATE_PROFILE_COMPLETENESS' as const],
        completenessScore: readiness.completenessScore,
        missingRequiredFields: [],
        contradictionsCount: contradictions.length,
        workflowStatus: 'RUNNING' as const,
      };
    })
    // 3. INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS
    .addNode('INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS', async (state) => {
      await ingestCandidateSnapshotIntoRag({
        candidateId: state.candidateId,
        snapshot: state.snapshot!,
        cvExtractedText: state.cvExtractedText,
        persistToDatabase: Boolean(state.persistToDatabase),
      });
      return {
        currentNode: 'INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS' as const,
        completedNodes: ['INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS' as const],
      };
    })
    // 4. RETRIEVE_CANDIDATE_CONTEXT (via isolated LangChain BaseRetriever)
    .addNode('RETRIEVE_CANDIDATE_CONTEXT', async (state) => {
      const snap = state.snapshot!;
      const retriever = new JobiestIsolatedLangChainRetriever({
        namespace: 'CANDIDATE_KNOWLEDGE',
        candidateId: state.candidateId,
        topK: 8,
      });
      const query = `${snap.target_roles.join(' ')} ${snap.headline ?? ''} ${snap.skills.slice(0, 8).join(' ')}`;
      const docs = await retriever.invoke(query);
      const hits: RetrievedEvidence[] = docs.map((d) => ({
        chunkId: String(d.metadata.chunkId ?? ''),
        documentId: String(d.metadata.documentId ?? ''),
        text: d.pageContent,
        score: Number(d.metadata.similarityScore ?? 0.5),
        metadata: d.metadata as RetrievedEvidence['metadata'],
      }));
      return {
        currentNode: 'RETRIEVE_CANDIDATE_CONTEXT' as const,
        completedNodes: ['RETRIEVE_CANDIDATE_CONTEXT' as const],
        candidateRagHits: hits,
      };
    })
    // 5. RETRIEVE_ROLE_COMPETENCIES
    .addNode('RETRIEVE_ROLE_COMPETENCIES', async (state) => {
      const snap = state.snapshot!;
      const roleRetriever = new JobiestIsolatedLangChainRetriever({
        namespace: 'JOB_COMPETENCY_KNOWLEDGE',
        careerCategory: snap.career_category,
        topK: 4,
      });
      const rubricRetriever = new JobiestIsolatedLangChainRetriever({
        namespace: 'ASSESSMENT_KNOWLEDGE',
        topK: 2,
      });
      const [roleDocs, rubricDocs] = await Promise.all([
        roleRetriever.invoke(`${snap.career_category ?? ''} ${snap.seniority_level ?? ''} ${snap.skills.join(' ')}`),
        rubricRetriever.invoke('scoring rubric competency evaluation'),
      ]);
      const combined: RetrievedEvidence[] = [...roleDocs, ...rubricDocs].map((d) => ({
        chunkId: String(d.metadata.chunkId ?? ''),
        documentId: String(d.metadata.documentId ?? ''),
        text: d.pageContent,
        score: Number(d.metadata.similarityScore ?? 0.5),
        metadata: d.metadata as RetrievedEvidence['metadata'],
      }));
      return {
        currentNode: 'RETRIEVE_ROLE_COMPETENCIES' as const,
        completedNodes: ['RETRIEVE_ROLE_COMPETENCIES' as const],
        roleRagHits: combined,
      };
    })
    // 6. ANALYZE_CANDIDATE (System Prompt A)
    .addNode('ANALYZE_CANDIDATE', async (state) => {
      const snap = state.snapshot!;
      const cvFacts = extractStructuredFactsFromCvText(state.cvExtractedText);
      const contradictions = detectProfileAndCvContradictions(snap, cvFacts);
      const { analysis, telemetry } = await runCandidateProfileIntelligenceAnalyst({
        userId: state.candidateId,
        snapshot: snap,
        cvFacts,
        missingLabels: state.missingRequiredFields ?? [],
        contradictions,
        completenessScore: state.completenessScore ?? 100,
        eligibleForAssessment: true,
        ragCompetencyHits: state.roleRagHits ?? [],
      });
      return {
        currentNode: 'ANALYZE_CANDIDATE' as const,
        completedNodes: ['ANALYZE_CANDIDATE' as const],
        candidateAnalysis: analysis,
        telemetryCalls: [telemetry],
      };
    })
    // 7. GENERATE_INTERVIEW_BLUEPRINT (System Prompt B)
    .addNode('GENERATE_INTERVIEW_BLUEPRINT', async (state) => {
      const { blueprint, telemetry } = await runPersonalizedInterviewBlueprintArchitect({
        userId: state.candidateId,
        analysis: state.candidateAnalysis!,
        candidateRagHits: state.candidateRagHits ?? [],
        roleRagHits: state.roleRagHits ?? [],
        targetQuestionCount: state.targetQuestionCount,
      });
      return {
        currentNode: 'GENERATE_INTERVIEW_BLUEPRINT' as const,
        completedNodes: ['GENERATE_INTERVIEW_BLUEPRINT' as const],
        interviewBlueprint: blueprint,
        telemetryCalls: [telemetry],
      };
    })
    // 8. VALIDATE_QUESTION_QUALITY
    .addNode('VALIDATE_QUESTION_QUALITY', async (state) => {
      const { blueprint, report } = validateAndRepairInterviewBlueprint({
        blueprint: state.interviewBlueprint!,
        analysis: state.candidateAnalysis!,
        candidateRagHits: state.candidateRagHits ?? [],
        roleRagHits: state.roleRagHits ?? [],
      });
      if (!report.passed) {
        return {
          currentNode: 'VALIDATE_QUESTION_QUALITY' as const,
          workflowStatus: 'FAILED' as const,
          errorCode: 'QUESTION_QUALITY_GATE_FAILED',
          qualityReport: report,
        };
      }
      return {
        currentNode: 'VALIDATE_QUESTION_QUALITY' as const,
        completedNodes: ['VALIDATE_QUESTION_QUALITY' as const],
        interviewBlueprint: blueprint,
        qualityReport: report,
      };
    })
    // 9. CREATE_INTERVIEW_SESSION
    .addNode('CREATE_INTERVIEW_SESSION', async (state) => {
      const bp = state.interviewBlueprint!;
      const greeting = buildInterviewerOpeningGreeting({
        candidateName: state.snapshot?.full_name ?? null,
        professionalTitle: bp.professional_title,
        questionCount: bp.questions.length,
        firstQuestionText: bp.questions[0].question_text,
        mode: state.assessmentRoute,
      });
      const nextStatus: WorkflowLifecycleStatus =
        state.phase === 'PREPARE_SESSION' ? 'AWAITING_CANDIDATE_ANSWER' : 'RUNNING';
      return {
        currentNode: 'CREATE_INTERVIEW_SESSION' as const,
        completedNodes: ['CREATE_INTERVIEW_SESSION' as const],
        openingGreeting: greeting,
        currentQuestionIndex: state.currentQuestionIndex ?? 0,
        workflowStatus: nextStatus,
      };
    })
    // 10. CONDUCT_INTERVIEW
    .addNode('CONDUCT_INTERVIEW', async (state) => {
      if (state.incomingTurn?.interrupted) {
        return {
          currentNode: 'CONDUCT_INTERVIEW' as const,
          workflowStatus: 'PAUSED_INTERRUPTION' as const,
          interruptionReason: state.incomingTurn.interruptionReason || 'network_or_media_interruption',
          technicalInterruptions: [
            `${state.incomingTurn.questionId}:${state.incomingTurn.interruptionReason || 'interrupted'}`,
          ],
        };
      }
      return {
        currentNode: 'CONDUCT_INTERVIEW' as const,
        completedNodes: ['CONDUCT_INTERVIEW' as const],
        workflowStatus: 'RUNNING' as const,
      };
    })
    // 11. TRANSCRIBE_RESPONSES
    .addNode('TRANSCRIBE_RESPONSES', async (state) => {
      const turn = state.incomingTurn;
      if (!turn) {
        return {
          currentNode: 'TRANSCRIBE_RESPONSES' as const,
          completedNodes: ['TRANSCRIBE_RESPONSES' as const],
        };
      }

      if (
        turn.modality === 'VOICE' &&
        (!turn.rawTranscript.trim() || (typeof turn.sttConfidence === 'number' && turn.sttConfidence < 0.25))
      ) {
        return {
          currentNode: 'TRANSCRIBE_RESPONSES' as const,
          completedNodes: ['TRANSCRIBE_RESPONSES' as const],
          technicalInterruptions: [`${turn.questionId}:stt_low_confidence`],
        };
      }

      const existing = [...(state.answers ?? [])];
      const idx = existing.findIndex((a) => a.question_id === turn.questionId);
      if (idx >= 0) {
        existing[idx] = {
          ...existing[idx],
          followup_transcript: turn.rawTranscript,
          duration_seconds: existing[idx].duration_seconds + (turn.durationSeconds || 0),
        };
      } else {
        existing.push({
          question_id: turn.questionId,
          answer_transcript: turn.rawTranscript,
          modality: turn.modality,
          duration_seconds: turn.durationSeconds || 0,
          stt_confidence: turn.sttConfidence ?? 1.0,
          technical_interruption: false,
        });
      }

      return {
        currentNode: 'TRANSCRIBE_RESPONSES' as const,
        completedNodes: ['TRANSCRIBE_RESPONSES' as const],
        answers: existing,
      };
    })
    // 12. GENERATE_ADAPTIVE_FOLLOW_UP (System Prompt C)
    .addNode('GENERATE_ADAPTIVE_FOLLOW_UP', async (state) => {
      const bp = state.interviewBlueprint!;
      const turn = state.incomingTurn;
      if (!turn) {
        return {
          currentNode: 'GENERATE_ADAPTIVE_FOLLOW_UP' as const,
          completedNodes: ['GENERATE_ADAPTIVE_FOLLOW_UP' as const],
        };
      }

      const qIdx = Math.max(
        0,
        bp.questions.findIndex((q) => q.question_id === turn.questionId),
      );
      const currentQ = bp.questions[qIdx] ?? bp.questions[0];
      const followupsMap = { ...(state.followupCountsByQuestion ?? {}) };
      const alreadyAsked = followupsMap[currentQ.question_id] ?? 0;
      const nextPrimaryQ = bp.questions[qIdx + 1] ?? null;

      const { turn: aiTurn, telemetry } = await runRealtimeInterviewerTurn({
        userId: state.candidateId,
        currentQuestion: currentQ,
        candidateAnswer: turn.rawTranscript,
        followupsAlreadyAskedForQuestion: alreadyAsked,
        remainingPrimaryQuestions: bp.questions.length - 1 - qIdx,
        nextQuestionText: nextPrimaryQ?.question_text ?? null,
        sttConfidence: turn.sttConfidence ?? 1.0,
      });

      if (aiTurn.action === 'ASK_ADAPTIVE_FOLLOWUP') {
        followupsMap[currentQ.question_id] = alreadyAsked + 1;
        return {
          currentNode: 'GENERATE_ADAPTIVE_FOLLOW_UP' as const,
          completedNodes: ['GENERATE_ADAPTIVE_FOLLOW_UP' as const],
          followupCountsByQuestion: followupsMap,
          latestTurnResponse: aiTurn,
          workflowStatus: state.phase === 'CONDUCT_TURN' ? ('AWAITING_CANDIDATE_ANSWER' as const) : ('RUNNING' as const),
          telemetryCalls: [telemetry],
        };
      }

      if (aiTurn.action === 'REQUEST_AUDIO_REPEAT') {
        return {
          currentNode: 'GENERATE_ADAPTIVE_FOLLOW_UP' as const,
          completedNodes: ['GENERATE_ADAPTIVE_FOLLOW_UP' as const],
          latestTurnResponse: aiTurn,
          workflowStatus: 'AWAITING_CANDIDATE_ANSWER' as const,
          telemetryCalls: [telemetry],
        };
      }

      const nextIndex = Math.min(bp.questions.length, qIdx + 1);
      return {
        currentNode: 'GENERATE_ADAPTIVE_FOLLOW_UP' as const,
        completedNodes: ['GENERATE_ADAPTIVE_FOLLOW_UP' as const],
        completedQuestionIds: [currentQ.question_id],
        currentQuestionIndex: nextIndex,
        latestTurnResponse: aiTurn,
        workflowStatus: state.phase === 'CONDUCT_TURN' ? ('AWAITING_CANDIDATE_ANSWER' as const) : ('RUNNING' as const),
        telemetryCalls: [telemetry],
      };
    })
    // 13. VALIDATE_INTERVIEW_COMPLETION
    .addNode('VALIDATE_INTERVIEW_COMPLETION', async (state) => {
      if (state.workflowStatus === 'PAUSED_INTERRUPTION') {
        return {
          currentNode: 'VALIDATE_INTERVIEW_COMPLETION' as const,
          workflowStatus: 'PAUSED_INTERRUPTION' as const,
          errorCode: 'INTERRUPTED_INTERVIEW_CANNOT_COMPLETE',
        };
      }
      const bp = state.interviewBlueprint;
      if (!bp || bp.questions.length === 0) {
        return {
          currentNode: 'VALIDATE_INTERVIEW_COMPLETION' as const,
          workflowStatus: 'FAILED' as const,
          errorCode: 'MISSING_INTERVIEW_BLUEPRINT',
        };
      }
      const substantiveAnswers = (state.answers ?? []).filter(
        (a) => a.answer_transcript.trim().length > 0 || a.technical_interruption,
      );
      const minRequired = Math.max(1, Math.ceil(bp.questions.length * 0.7));
      if (substantiveAnswers.length < minRequired) {
        return {
          currentNode: 'VALIDATE_INTERVIEW_COMPLETION' as const,
          workflowStatus: 'FAILED' as const,
          errorCode: `INCOMPLETE_INTERVIEW_ANSWERS:${substantiveAnswers.length}/${bp.questions.length}`,
        };
      }
      return {
        currentNode: 'VALIDATE_INTERVIEW_COMPLETION' as const,
        completedNodes: ['VALIDATE_INTERVIEW_COMPLETION' as const],
        workflowStatus: 'RUNNING' as const,
        errorCode: null,
      };
    })
    // 14. EVALUATE_RESPONSES (System Prompt D)
    .addNode('EVALUATE_RESPONSES', async (state) => {
      const { evaluation, telemetry } = await runIndependentAssessmentEvaluator({
        candidateId: state.candidateId,
        applicationId: state.applicationId,
        assessmentId: `assess-${state.sessionId || state.threadId}`,
        analysis: state.candidateAnalysis!,
        blueprint: state.interviewBlueprint!,
        answers: state.answers ?? [],
      });
      return {
        currentNode: 'EVALUATE_RESPONSES' as const,
        completedNodes: ['EVALUATE_RESPONSES' as const],
        evaluation,
        telemetryCalls: [telemetry],
      };
    })
    // 15. GENERATE_ASSESSMENT_REPORT (Sections A..O)
    .addNode('GENERATE_ASSESSMENT_REPORT', async (state) => {
      if (!state.evaluation) {
        return {
          currentNode: 'GENERATE_ASSESSMENT_REPORT' as const,
          workflowStatus: 'FAILED' as const,
          errorCode: 'EVALUATION_MISSING_FOR_REPORT',
        };
      }
      const report = buildComprehensiveAssessmentReportAO({
        analysis: state.candidateAnalysis!,
        blueprint: state.interviewBlueprint!,
        answers: state.answers ?? [],
        evaluation: state.evaluation,
      });
      return {
        currentNode: 'GENERATE_ASSESSMENT_REPORT' as const,
        completedNodes: ['GENERATE_ASSESSMENT_REPORT' as const],
        comprehensiveReport: report,
      };
    })
    // 16. SUBMIT_FOR_HUMAN_REVIEW (Advisory only - AI NEVER auto-approves or auto-rejects)
    .addNode('SUBMIT_FOR_HUMAN_REVIEW', async (state) => {
      const receiptId = `review-sub-${state.applicationId}-${state.sessionId || state.threadId}`;
      return {
        currentNode: 'SUBMIT_FOR_HUMAN_REVIEW' as const,
        completedNodes: ['SUBMIT_FOR_HUMAN_REVIEW' as const],
        submittedForHumanReview: true,
        submissionReceiptId: receiptId,
        workflowStatus: 'COMPLETED' as const,
      };
    })

    // Conditional & sequential edges
    .addEdge(START, 'LOAD_CANDIDATE_PROFILE')
    .addConditionalEdges('LOAD_CANDIDATE_PROFILE', (s) => {
      if (s.workflowStatus === 'FAILED') return END;
      if (s.phase === 'CONDUCT_TURN' && s.interviewBlueprint) return 'CONDUCT_INTERVIEW';
      if (s.phase === 'FINALIZE_AND_SUBMIT' && s.interviewBlueprint && s.candidateAnalysis) {
        return 'VALIDATE_INTERVIEW_COMPLETION';
      }
      return 'VALIDATE_PROFILE_COMPLETENESS';
    })
    .addConditionalEdges('VALIDATE_PROFILE_COMPLETENESS', (s) =>
      s.workflowStatus === 'AWAITING_CANDIDATE_CONFIRMATION' || s.workflowStatus === 'FAILED'
        ? END
        : 'INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS',
    )
    .addEdge('INGEST_OR_REFRESH_CANDIDATE_DOCUMENTS', 'RETRIEVE_CANDIDATE_CONTEXT')
    .addEdge('RETRIEVE_CANDIDATE_CONTEXT', 'RETRIEVE_ROLE_COMPETENCIES')
    .addEdge('RETRIEVE_ROLE_COMPETENCIES', 'ANALYZE_CANDIDATE')
    .addEdge('ANALYZE_CANDIDATE', 'GENERATE_INTERVIEW_BLUEPRINT')
    .addEdge('GENERATE_INTERVIEW_BLUEPRINT', 'VALIDATE_QUESTION_QUALITY')
    .addConditionalEdges('VALIDATE_QUESTION_QUALITY', (s) =>
      s.workflowStatus === 'FAILED' ? END : 'CREATE_INTERVIEW_SESSION',
    )
    .addConditionalEdges('CREATE_INTERVIEW_SESSION', (s) => {
      if (s.phase === 'PREPARE_SESSION') return END;
      return 'CONDUCT_INTERVIEW';
    })
    .addConditionalEdges('CONDUCT_INTERVIEW', (s) => {
      if (s.workflowStatus === 'PAUSED_INTERRUPTION') return END;
      return 'TRANSCRIBE_RESPONSES';
    })
    .addEdge('TRANSCRIBE_RESPONSES', 'GENERATE_ADAPTIVE_FOLLOW_UP')
    .addConditionalEdges('GENERATE_ADAPTIVE_FOLLOW_UP', (s) => {
      if (s.phase === 'CONDUCT_TURN') return END;
      return 'VALIDATE_INTERVIEW_COMPLETION';
    })
    .addConditionalEdges('VALIDATE_INTERVIEW_COMPLETION', (s) =>
      s.workflowStatus === 'FAILED' || s.workflowStatus === 'PAUSED_INTERRUPTION'
        ? END
        : 'EVALUATE_RESPONSES',
    )
    .addEdge('EVALUATE_RESPONSES', 'GENERATE_ASSESSMENT_REPORT')
    .addConditionalEdges('GENERATE_ASSESSMENT_REPORT', (s) =>
      s.workflowStatus === 'FAILED' ? END : 'SUBMIT_FOR_HUMAN_REVIEW',
    )
    .addEdge('SUBMIT_FOR_HUMAN_REVIEW', END);

  return workflow.compile({ checkpointer: sharedMemoryCheckpointer });
}

const compiledInterviewGraph = buildJobiestInterviewLangGraph();

export async function invokeInterviewWorkflow(
  input: Partial<InterviewGraphState> & {
    threadId: string;
    candidateId: string;
    applicationId: string;
    phase: WorkflowExecutionPhase;
  },
): Promise<{ state: InterviewGraphState; telemetrySummary: InterviewTelemetrySummary }> {
  const idemKey = `${input.threadId}:${input.phase}:${input.idempotencyKey ?? ''}`;
  if (input.idempotencyKey && completedIdempotencyReceipts.has(idemKey)) {
    const cachedState = completedIdempotencyReceipts.get(idemKey)!;
    return {
      state: cachedState,
      telemetrySummary: summarizeTelemetry(cachedState.telemetryCalls ?? []),
    };
  }

  const outState = (await compiledInterviewGraph.invoke(
    {
      sessionId: input.sessionId ?? input.threadId,
      assessmentRoute: input.assessmentRoute ?? 'VIDEO_VOICE',
      candidateConfirmedDiscrepancies: input.candidateConfirmedDiscrepancies ?? false,
      persistToDatabase: input.persistToDatabase ?? false,
      ...input,
    },
    { configurable: { thread_id: input.threadId } },
  )) as InterviewGraphState;

  await persistCheckpointBestEffort(outState);

  if (input.idempotencyKey && outState.workflowStatus === 'COMPLETED') {
    completedIdempotencyReceipts.set(idemKey, outState);
  }

  return {
    state: outState,
    telemetrySummary: summarizeTelemetry(outState.telemetryCalls ?? []),
  };
}
