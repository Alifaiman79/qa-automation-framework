import { randomBytes } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

type EvidenceStatus = 'PASS' | 'FAIL';
type EvidenceKey = { project: string; browser: string; testCaseId: string };
type AttemptRecord = { status: EvidenceStatus; retry: number };
type ExecutionRecord = { version: 1; executionId: string; key: EvidenceKey; completedAt: string; attempts: AttemptRecord[] };
type ActivityStep = {
  description: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: EvidenceStatus;
  failureMessage?: string;
};
type ActivityLog = {
  schemaVersion: 1;
  executionId: string;
  testCaseId: string;
  project: string;
  browser: string;
  testScope: string;
  attemptNumber: number;
  retryIndex: number;
  attemptStatus: EvidenceStatus;
  logicalTestFinalStatus: EvidenceStatus | null;
  logicalTestOutcome: ReturnType<TestCase['outcome']> | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  steps: ActivityStep[];
  failureMessages: string[];
};
type AttemptLogFiles = { jsonPath: string; textPath: string; log: ActivityLog };
type AttemptTiming = { startedAtMs: number };
type ExecutionState = {
  executionId: string;
  key: EvidenceKey;
  testScope: string;
  testCase: TestCase;
  attempts: AttemptRecord[];
  attemptLogs: AttemptLogFiles[];
  writeFailed: boolean;
};
type SummarySuite = 'default' | 'integration' | 'auth' | 'other';
type SummaryOutcome = 'passed' | 'failed' | 'flaky' | 'skipped' | 'interrupted' | 'unexecuted';
type SummaryTest = {
  recordIndex: number;
  testCaseId: string | null;
  caseIdQuality: 'annotation' | 'title' | 'invalid-annotation' | 'conflict' | 'missing';
  legacyEvidenceId: string | null;
  project: string | null;
  browser: string | null;
  scope: string | null;
  repeatEachIndex: number | null;
  outcome: SummaryOutcome;
  playwrightOutcome: ReturnType<TestCase['outcome']> | null;
  expectedStatus: TestCase['expectedStatus'];
  finalAttemptStatus: TestResult['status'] | null;
  durationMs: number;
  attempts: number;
  retryAttempts: number;
  duplicateRetentionKey: boolean;
  evidence: string[];
};
const COMPLETE_FILE = 'execution-complete.json';
const LOCK_NAME = '.retention-lock';
const LOCK_OWNER_FILE = 'owner.token';
const CASE_ID_PATTERN = /^[A-Z0-9]+_TC_(?:[A-Z0-9]+_)*[0-9]+$/i;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SAFE_SCOPES = new Set(['SMOKE', 'API', 'API_UI_INTEGRATION', 'AUTH', 'AUTHENTICATION', 'RBAC']);

/** Cleanup helper exported so retention can be validated against isolated fixture trees. */
export async function pruneEvidenceForKey(evidenceRoot: string, key: EvidenceKey): Promise<void> {
  const root = path.resolve(evidenceRoot);
  if (!(await isRealDirectory(root))) return;
  const executions = new Map<string, { directory: string; record: ExecutionRecord }>();
  for (const status of ['PASS', 'FAIL'] as const) {
    const keyRoot = path.join(root, status, key.project, key.browser, key.testCaseId);
    if (!(await isRealDirectory(keyRoot)) || !(await isInside(root, keyRoot))) continue;
    for (const entry of await readdir(keyRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(keyRoot, entry.name);
      if (!(await isRealDirectory(directory)) || !(await isInside(root, directory))) continue;
      const marker = path.join(directory, COMPLETE_FILE);
      try {
        const markerStat = await lstat(marker);
        if (!markerStat.isFile() || markerStat.isSymbolicLink()) continue;
        const record = JSON.parse(await readFile(marker, 'utf8')) as ExecutionRecord;
        if (record.version !== 1 || !/^[A-Za-z0-9_-]+$/.test(record.executionId)
          || path.basename(directory) !== record.executionId || !Number.isFinite(Date.parse(record.completedAt))
          || record.key?.project !== key.project || record.key?.browser !== key.browser
          || record.key?.testCaseId !== key.testCaseId || !Array.isArray(record.attempts)) continue;
        executions.set(record.executionId, { directory, record });
      } catch { /* Incomplete or ambiguous metadata is preserved. */ }
    }
  }
  if (executions.size < 2) return;
  const ordered = [...executions.values()].sort((a, b) => Date.parse(b.record.completedAt) - Date.parse(a.record.completedAt));
  for (const { record } of ordered.slice(1)) {
    for (const status of ['PASS', 'FAIL'] as const) {
      const directory = path.join(root, status, key.project, key.browser, key.testCaseId, record.executionId);
      if (!(await isRealDirectory(directory))) continue;
      if (!(await isInside(root, directory)) || !(await treeHasNoSymlinks(directory))) continue;
      await rm(directory, { recursive: true, force: false });
    }
  }
}

async function isRealDirectory(directory: string): Promise<boolean> {
  try { const stat = await lstat(directory); return stat.isDirectory() && !stat.isSymbolicLink(); }
  catch { return false; }
}

async function hasRealDirectoryAncestors(directory: string): Promise<boolean> {
  const resolved = path.resolve(directory);
  let current = path.parse(resolved).root;
  if (!(await isRealDirectory(current))) return false;
  for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!(await isRealDirectory(current))) return false;
  }
  return true;
}

async function isInside(root: string, target: string): Promise<boolean> {
  const relative = path.relative(root, path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try { const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) return false; }
    catch { return false; }
  }
  return true;
}

async function treeHasNoSymlinks(directory: string): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    const stat = await lstat(child);
    if (stat.isSymbolicLink()) return false;
    if (stat.isDirectory() && !(await treeHasNoSymlinks(child))) return false;
  }
  return true;
}

export default class EvidenceReporter implements Reporter {
  private configProject = 'UNASSIGNED';
  private readonly executions = new Map<string, ExecutionState>();
  private readonly stepsByAttempt = new Map<string, ActivityStep[]>();
  private readonly attemptTimings = new Map<string, AttemptTiming>();
  private evidenceRoot = path.resolve(process.cwd(), 'test-evidence');
  private cleanupEnabled = false;
  private lockOwned = false;
  private lockPath = '';
  private lockToken = '';
  private discoveredTests: TestCase[] = [];
  private readonly startedTests = new Set<TestCase>();
  private globalErrorCount = 0;
  private summarySuite: SummarySuite = 'other';
  private summaryId = '';
  private summaryConfigProject: string | null = null;

  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    this.configProject = this.readProject(config.metadata) || 'UNASSIGNED';
    this.cleanupEnabled = process.env.EVIDENCE_RETENTION_ENABLED === 'true';
    try {
      this.summaryConfigProject = typeof config.metadata.evidenceProject === 'string'
        ? this.validatedSegment(config.metadata.evidenceProject) : null;
      this.discoveredTests = suite.allTests();
      const configName = path.basename(config.configFile || '');
      this.summarySuite = configName === 'playwright.config.ts' ? 'default'
        : configName === 'playwright.integration.config.ts' ? 'integration'
          : configName === 'playwright.auth.config.ts' ? 'auth' : 'other';
      this.summaryId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${randomBytes(16).toString('hex')}`;
    } catch {
      this.summaryId = '';
      this.diagnostic('Execution summary initialization failed; test results are unaffected.');
    }
  }

  onError(): void {
    this.globalErrorCount += 1;
  }

  private async acquireRetentionLock(): Promise<boolean> {
    try {
      await mkdir(this.evidenceRoot, { recursive: true });
      const rootStat = await lstat(this.evidenceRoot);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Evidence root is not a real directory');
      this.lockPath = path.join(this.evidenceRoot, LOCK_NAME);
      await mkdir(this.lockPath);
      this.lockOwned = true;
      this.lockToken = randomBytes(24).toString('hex');
      await writeFile(path.join(this.lockPath, LOCK_OWNER_FILE), this.lockToken, { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch (error) {
      // A concurrent or stale lock fails closed. It is intentionally not auto-recovered.
      this.diagnostic(`Retention lock unavailable; cleanup skipped (${this.errorCode(error)}).`);
      if (this.lockOwned) await this.releaseRetentionLock();
      return false;
    }
  }

  private getTestContext(test: TestCase): { key: EvidenceKey; testScope: string } {
    const projectMetadata = test.parent.project()?.metadata;
    const projectAnnotation = [...test.annotations].reverse().find(
      (annotation) => annotation.type === 'evidenceProject' && annotation.description,
    );
    const project = this.readProject({ evidenceProject: projectAnnotation?.description })
      || this.readProject(projectMetadata)
      || this.configProject;
    const testCaseId = this.readTestCaseId(test);
    const browser = this.safeSegment(test.parent.project()?.name || 'UNASSIGNED');
    const scopeAnnotation = [...test.annotations].reverse().find(
      (annotation) => annotation.type === 'testScope' && annotation.description?.trim(),
    );
    return {
      key: { project, browser, testCaseId },
      testScope: scopeAnnotation?.description?.trim() || 'UNSPECIFIED',
    };
  }

  private executionKey(test: TestCase, key: EvidenceKey): string {
    return JSON.stringify([test.id, test.repeatEachIndex, key.project, key.browser, key.testCaseId]);
  }

  private attemptKey(test: TestCase, key: EvidenceKey, retry: number): string {
    return JSON.stringify([test.id, test.repeatEachIndex, key.project, key.browser, key.testCaseId, retry]);
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep): void {
    // Keep authored test.step activities and failures from nested assertions, but
    // omit raw Playwright call parameters, subtitles, and attached payloads.
    if (step.category !== 'test.step' && !step.error) return;
    const { key } = this.getTestContext(test);
    const started = step.startTime;
    const ended = new Date(started.getTime() + step.duration);
    const pathParts = step.titlePath().filter(Boolean);
    const description = this.redact(pathParts.join(' > ') || step.title);
    const activity: ActivityStep = {
      description,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: step.duration,
      status: step.error ? 'FAIL' : 'PASS',
    };
    if (step.error) activity.failureMessage = this.redact(step.error.message || 'Unspecified step failure');
    const attemptKey = this.attemptKey(test, key, result.retry);
    const activities = this.stepsByAttempt.get(attemptKey) || [];
    activities.push(activity);
    this.stepsByAttempt.set(attemptKey, activities);
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.startedTests.add(test);
    const { key } = this.getTestContext(test);
    this.attemptTimings.set(this.attemptKey(test, key, result.retry), { startedAtMs: Date.now() });
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (result.status === 'skipped') {
      const { key } = this.getTestContext(test);
      const attemptKey = this.attemptKey(test, key, result.retry);
      this.stepsByAttempt.delete(attemptKey);
      this.attemptTimings.delete(attemptKey);
      return;
    }
    // Capture the execution end before copying evidence or writing log files.
    const observedEndMs = Date.now();

    const { key, testScope } = this.getTestContext(test);
    const { project, browser, testCaseId } = key;
    const executionKey = this.executionKey(test, key);
    const attemptKey = this.attemptKey(test, key, result.retry);
    let execution = this.executions.get(executionKey);
    if (!execution) {
      const timestamp = result.startTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      execution = {
        executionId: `${timestamp}-${randomBytes(8).toString('hex')}`,
        key,
        testScope,
        testCase: test,
        attempts: [],
        attemptLogs: [],
        writeFailed: false,
      };
      this.executions.set(executionKey, execution);
    }
    try {
      const status: EvidenceStatus = result.status === 'passed' ? 'PASS' : 'FAIL';
      const attempt = `ATTEMPT_${result.retry}`;
      const evidenceDirectory = path.join(
        this.evidenceRoot,
        status,
        project,
        browser,
        testCaseId,
        execution.executionId,
        attempt,
      );

      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(path.join(evidenceDirectory, 'attempt-manifest.json'), JSON.stringify({ version: 1, executionId: execution.executionId, key, retry: result.retry, status }, null, 2), 'utf8');
      await this.copyScreenshots(result, evidenceDirectory, status);

      if (status === 'FAIL') {
        const details = result.errors.map((error) => error.message || error.stack || 'Unspecified test failure');
        await writeFile(path.join(evidenceDirectory, 'error.txt'), this.redact(details.join('\n\n')), 'utf8');
      }

      await this.copyOtherEvidence(result, evidenceDirectory);
      const attemptStatus: EvidenceStatus = result.status === 'passed' ? 'PASS' : 'FAIL';
      const steps = [...(this.stepsByAttempt.get(attemptKey) || [])]
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
      const timing = this.attemptTimings.get(attemptKey);
      const startedAtMs = timing?.startedAtMs ?? result.startTime.getTime();
      const lastStepEndMs = steps.reduce((latest, step) => Math.max(latest, Date.parse(step.endedAt)), startedAtMs);
      const endedAtMs = Math.max(observedEndMs, lastStepEndMs);
      const activityLog: ActivityLog = {
        schemaVersion: 1,
        executionId: execution.executionId,
        testCaseId,
        project,
        browser,
        testScope,
        attemptNumber: result.retry + 1,
        retryIndex: result.retry,
        attemptStatus,
        logicalTestFinalStatus: null,
        logicalTestOutcome: null,
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: Math.max(0, endedAtMs - startedAtMs),
        steps,
        failureMessages: result.status === 'passed'
          ? []
          : result.errors.map((error) => this.redact(error.message || 'Unspecified test failure')),
      };
      const jsonPath = path.join(evidenceDirectory, 'execution-log.json');
      const textPath = path.join(evidenceDirectory, 'execution-log.txt');
      await writeFile(jsonPath, JSON.stringify(activityLog, null, 2), 'utf8');
      await writeFile(textPath, this.formatActivityLog(activityLog), 'utf8');
      execution.attemptLogs.push({ jsonPath, textPath, log: activityLog });
      await writeFile(path.join(evidenceDirectory, 'attempt-complete.json'), JSON.stringify({ version: 1, completedAt: new Date().toISOString() }), 'utf8');
      execution.attempts.push({ status, retry: result.retry });
    } catch (error) {
      execution.writeFailed = true;
      this.diagnostic(`Attempt evidence write failed; retention for this case will be skipped (${this.errorCode(error)}).`);
      // Evidence collection is best effort and must never change the Playwright test result.
    } finally {
      this.stepsByAttempt.delete(attemptKey);
      this.attemptTimings.delete(attemptKey);
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    try {
      await this.finalizeActivityLogs();
      if (!this.cleanupEnabled) {
        this.diagnostic('onEnd skipped retention because cleanup is disabled.');
        return;
      }
      if (result.status === 'interrupted' || result.status === 'timedout') {
        this.diagnostic(`onEnd skipped completion markers and cleanup for ${result.status} run.`);
        return;
      }
      const eligibleExecutions = [...this.executions.values()].filter(
        (execution) => !execution.writeFailed && execution.attempts.length > 0,
      );
      if (eligibleExecutions.length !== this.executions.size) {
        this.diagnostic('Completion markers skipped for one or more incomplete executions.');
      }
      if (eligibleExecutions.length === 0) {
        this.diagnostic('onEnd skipped retention because there is no complete evidence to retain.');
        return;
      }
      if (!(await this.acquireRetentionLock())) return;

      try {
        const keys = new Map<string, EvidenceKey>();
        for (const execution of eligibleExecutions) {
          const record: ExecutionRecord = { version: 1, executionId: execution.executionId, key: execution.key, completedAt: new Date().toISOString(), attempts: execution.attempts };
          const finalStatus = execution.attempts[execution.attempts.length - 1].status;
          const directory = path.join(this.evidenceRoot, finalStatus, execution.key.project, execution.key.browser, execution.key.testCaseId, execution.executionId);
          try {
            await writeFile(path.join(directory, COMPLETE_FILE), JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' });
          } catch (error) {
            this.diagnostic(`Execution completion marker write failed (${this.errorCode(error)}); cleanup aborted.`);
            return;
          }
          keys.set(JSON.stringify(execution.key), execution.key);
        }
        for (const [serializedKey, key] of keys) {
          const hasFailedWrite = [...this.executions.values()].some((execution) => JSON.stringify(execution.key) === serializedKey && execution.writeFailed);
          if (hasFailedWrite) {
            this.diagnostic('Cleanup skipped for a case with incomplete attempt evidence.');
            continue;
          }
          try {
            await pruneEvidenceForKey(this.evidenceRoot, key);
          } catch (error) {
            this.diagnostic(`Evidence cleanup failed (${this.errorCode(error)}); remaining evidence was left in place.`);
          }
        }
      } catch (error) {
        // Retention failures are non-fatal; existing evidence is preserved where possible.
        this.diagnostic(`Retention lifecycle failed (${this.errorCode(error)}).`);
      } finally {
        await this.releaseRetentionLock();
      }
    } finally {
      try {
        await this.writeExecutionSummary(result);
      } catch {
        this.diagnostic('Execution summary write failed; no finalized summary was published.');
      }
    }
  }

  private validatedCaseId(value: string | undefined): string | null {
    return value && value.length <= 80 && CASE_ID_PATTERN.test(value) ? value.toUpperCase() : null;
  }

  private summaryCaseId(test: TestCase): Pick<SummaryTest, 'testCaseId' | 'caseIdQuality'> {
    const annotation = [...test.annotations].reverse().find((item) => item.type === 'testCaseId');
    const annotatedId = this.validatedCaseId(annotation?.description);
    const title = [...test.titlePath(), test.title].join(' ');
    const titleId = this.validatedCaseId(title.match(/\b[A-Z0-9]+_TC_(?:[A-Z0-9]+_)*\d+\b/i)?.[0]);
    if (annotatedId && titleId && annotatedId !== titleId) {
      return { testCaseId: annotatedId, caseIdQuality: 'conflict' };
    }
    if (annotatedId) return { testCaseId: annotatedId, caseIdQuality: 'annotation' };
    if (annotation) return { testCaseId: titleId, caseIdQuality: 'invalid-annotation' };
    return { testCaseId: titleId, caseIdQuality: titleId ? 'title' : 'missing' };
  }

  private validatedSegment(value: string): string | null {
    return SAFE_SEGMENT_PATTERN.test(value) ? value : null;
  }

  private summaryProject(test: TestCase): string | null {
    const annotation = [...test.annotations].reverse().find((item) => item.type === 'evidenceProject');
    if (annotation) return this.validatedSegment(annotation.description || '');
    const projectMetadata = test.parent.project()?.metadata.evidenceProject;
    if (projectMetadata !== undefined) {
      return typeof projectMetadata === 'string' ? this.validatedSegment(projectMetadata) : null;
    }
    return this.summaryConfigProject;
  }

  private summaryOutcome(test: TestCase, overallStatus: FullResult['status']): SummaryOutcome {
    const finalAttempt = test.results.at(-1);
    if (!finalAttempt) return 'unexecuted';
    if (finalAttempt.status === 'interrupted') return 'interrupted';
    if (finalAttempt.status === 'skipped') {
      // Playwright may synthesize skipped results for tests never started after an interruption or setup failure.
      if (test.expectedStatus === 'skipped' || this.startedTests.has(test)) return 'skipped';
      return 'unexecuted';
    }
    if (overallStatus === 'interrupted' && !this.startedTests.has(test)) return 'unexecuted';
    const outcome = test.outcome();
    if (outcome === 'flaky') return 'flaky';
    if (outcome === 'expected') return 'passed';
    if (outcome === 'unexpected') return 'failed';
    return 'unexecuted';
  }

  private async summaryEvidence(test: TestCase, safeProject: string | null,
    safeBrowser: string | null): Promise<string[]> {
    const references: string[] = [];
    if (!safeProject || !safeBrowser) return references;
    if (!(await isRealDirectory(this.evidenceRoot))) return references;
    for (const execution of this.executions.values()) {
      if (execution.testCase !== test || execution.writeFailed) continue;
      const { project, browser, testCaseId } = execution.key;
      if (project !== safeProject || browser !== safeBrowser) continue;
      if (![project, browser, testCaseId, execution.executionId].every((segment) => this.validatedSegment(segment))) continue;
      for (const attempt of execution.attempts) {
        if (!Number.isSafeInteger(attempt.retry) || attempt.retry < 0) continue;
        const relative = path.join(attempt.status, project, browser, testCaseId,
          execution.executionId, `ATTEMPT_${attempt.retry}`);
        const directory = path.join(this.evidenceRoot, relative);
        if (!(await isRealDirectory(directory)) || !(await isInside(this.evidenceRoot, directory))) continue;
        try {
          const marker = await lstat(path.join(directory, 'attempt-complete.json'));
          if (marker.isFile() && !marker.isSymbolicLink()) references.push(relative.split(path.sep).join('/'));
        } catch { /* An absent or incomplete attempt is not referenced. */ }
      }
    }
    return references;
  }

  private async writeExecutionSummary(result: FullResult): Promise<void> {
    if (!this.summaryId) throw new Error('Summary lifecycle did not start');
    const retentionKeys = new Map<string, number>();
    for (const test of this.discoveredTests) {
      const key = this.getTestContext(test).key;
      const serialized = JSON.stringify(key);
      retentionKeys.set(serialized, (retentionKeys.get(serialized) || 0) + 1);
    }

    const tests: SummaryTest[] = [];
    for (const [index, test] of this.discoveredTests.entries()) {
      const context = this.getTestContext(test);
      const { key } = context;
      const attempts = test.results.filter((attempt) => attempt.status !== 'skipped');
      const caseId = this.summaryCaseId(test);
      const legacyId = this.validatedCaseId(key.testCaseId);
      const outcome = this.summaryOutcome(test, result.status);
      const finalAttempt = test.results.at(-1);
      const safeProject = this.summaryProject(test);
      const safeBrowser = this.validatedSegment(test.parent.project()?.name || 'UNASSIGNED');
      tests.push({
        recordIndex: index + 1,
        ...caseId,
        legacyEvidenceId: legacyId !== caseId.testCaseId ? legacyId : null,
        project: safeProject,
        browser: safeBrowser,
        scope: SAFE_SCOPES.has(context.testScope) ? context.testScope : null,
        repeatEachIndex: Number.isSafeInteger(test.repeatEachIndex) && test.repeatEachIndex >= 0
          ? test.repeatEachIndex : null,
        outcome,
        playwrightOutcome: outcome === 'unexecuted' ? null : test.outcome(),
        expectedStatus: test.expectedStatus,
        finalAttemptStatus: finalAttempt?.status || null,
        durationMs: attempts.reduce((sum, attempt) => sum + (Number.isFinite(attempt.duration)
          ? Math.max(0, attempt.duration) : 0), 0),
        attempts: attempts.length,
        retryAttempts: attempts.filter((attempt) => attempt.retry > 0).length,
        duplicateRetentionKey: (retentionKeys.get(JSON.stringify(key)) || 0) > 1,
        evidence: await this.summaryEvidence(test, safeProject, safeBrowser),
      });
    }

    const count = (outcome: SummaryOutcome): number => tests.filter((test) => test.outcome === outcome).length;
    const passed = count('passed');
    const failed = count('failed');
    const flaky = count('flaky');
    const skipped = count('skipped');
    const interrupted = count('interrupted');
    const unexecuted = count('unexecuted');
    const complete = tests.length > 0 && interrupted === 0 && unexecuted === 0
      && this.globalErrorCount === 0 && result.status !== 'interrupted' && result.status !== 'timedout';
    const denominator = passed + flaky + failed;
    const counts = {
      total: tests.length, passed, failed, flaky, skipped, interrupted, unexecuted,
      totalAttempts: tests.reduce((sum, test) => sum + test.attempts, 0),
      retryAttempts: tests.reduce((sum, test) => sum + test.retryAttempts, 0),
      passRate: complete && denominator > 0 ? 100 * (passed + flaky) / denominator : null,
    };
    const wallDurationMs = Number.isFinite(result.duration) ? Math.max(0, result.duration) : null;
    const summary = {
      schemaVersion: 1,
      summaryId: this.summaryId,
      suite: this.summarySuite,
      startedAt: result.startTime.toISOString(),
      endedAt: wallDurationMs === null ? null : new Date(result.startTime.getTime() + wallDurationMs).toISOString(),
      wallDurationMs,
      overallStatus: result.status,
      complete,
      globalErrorCount: this.globalErrorCount,
      counts,
      tests,
    };
    const textSummary = [
      `Suite: ${summary.suite}`,
      `Summary ID: ${summary.summaryId}`,
      `Overall status: ${summary.overallStatus}`,
      `Complete: ${summary.complete ? 'yes' : 'no'}`,
      `Logical tests: ${counts.total}`,
      `Passed: ${passed}  Failed: ${failed}  Flaky: ${flaky}  Skipped: ${skipped}`,
      `Interrupted: ${interrupted}  Unexecuted: ${unexecuted}  Global errors: ${this.globalErrorCount}`,
      `Attempts: ${counts.totalAttempts}  Retry attempts: ${counts.retryAttempts}`,
      `Pass rate: ${counts.passRate === null ? 'unavailable' : `${counts.passRate.toFixed(2)}%`}`,
      `Wall duration: ${wallDurationMs === null ? 'unavailable' : `${wallDurationMs} ms`}`,
      '',
      'Tests:',
      ...tests.map((test) => `${test.recordIndex}. ${test.testCaseId || 'NO_VALID_CASE_ID'}: ${test.outcome} (${test.attempts} attempts)`),
      '',
    ].join('\n');

    const root = path.resolve(process.cwd(), 'run-summaries');
    const suiteDirectory = path.join(root, this.summarySuite);
    const pendingDirectory = path.join(suiteDirectory, `.pending-${this.summaryId}`);
    const finalDirectory = path.join(suiteDirectory, this.summaryId);
    if (path.relative(process.cwd(), root) !== 'run-summaries') throw new Error('Unsafe summary root');
    if (!(await hasRealDirectoryAncestors(process.cwd()))) throw new Error('Unsafe workspace directory');
    for (const directory of [root, suiteDirectory]) {
      try { await mkdir(directory); }
      catch (error) { if (this.errorCode(error) !== 'EEXIST') throw error; }
      if (!(await isRealDirectory(directory))) throw new Error('Unsafe summary directory');
    }
    await mkdir(pendingDirectory);
    if (!(await isRealDirectory(root)) || !(await isRealDirectory(suiteDirectory))
      || !(await isRealDirectory(pendingDirectory))) throw new Error('Unsafe summary directory');
    await writeFile(path.join(pendingDirectory, 'execution-summary.json'), JSON.stringify(summary, null, 2),
      { encoding: 'utf8', flag: 'wx' });
    await writeFile(path.join(pendingDirectory, 'execution-summary.txt'), `${textSummary}\n`,
      { encoding: 'utf8', flag: 'wx' });
    if (!(await isRealDirectory(root)) || !(await isRealDirectory(suiteDirectory))
      || !(await isRealDirectory(pendingDirectory))) throw new Error('Unsafe summary directory');
    try { await lstat(finalDirectory); throw new Error('Summary ID already exists'); }
    catch (error) { if (this.errorCode(error) !== 'ENOENT') throw error; }
    await rename(pendingDirectory, finalDirectory);
  }

  private async finalizeActivityLogs(): Promise<void> {
    for (const execution of this.executions.values()) {
      const finalAttempt = execution.testCase.results.at(-1);
      const finalStatus = finalAttempt && finalAttempt.status !== 'skipped'
        ? (finalAttempt.status === 'passed' ? 'PASS' : 'FAIL')
        : null;
      const outcome = execution.testCase.outcome();
      for (const attempt of execution.attemptLogs) {
        attempt.log.logicalTestFinalStatus = finalStatus;
        attempt.log.logicalTestOutcome = outcome;
        try {
          await writeFile(attempt.jsonPath, JSON.stringify(attempt.log, null, 2), 'utf8');
          await writeFile(attempt.textPath, this.formatActivityLog(attempt.log), 'utf8');
        } catch (error) {
          execution.writeFailed = true;
          this.diagnostic(`Final activity log write failed; retention for this case will be skipped (${this.errorCode(error)}).`);
        }
      }
    }
  }

  private formatActivityLog(log: ActivityLog): string {
    const formatUtcTime = (value: string): string => {
      const date = new Date(value);
      const twoDigits = (part: number): string => String(part).padStart(2, '0');
      const threeDigits = (part: number): string => String(part).padStart(3, '0');
      return `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}:${twoDigits(date.getUTCSeconds())}.${threeDigits(date.getUTCMilliseconds())}`;
    };
    const headers = ['Step', 'Time (UTC)', 'Activity', 'Status', 'Duration'];
    const rows: string[][] = [];
    log.steps.forEach((step, index) => {
      const activityLines = step.description.replace(/\|/g, '\\|').split(/\r?\n/);
      rows.push([
        String(index + 1),
        `${formatUtcTime(step.startedAt)}-${formatUtcTime(step.endedAt)}`,
        activityLines[0],
        step.status,
        `${step.durationMs} ms`,
      ]);
      for (const continuation of activityLines.slice(1)) rows.push(['', '', continuation, '', '']);
    });
    const columnWidths = headers.map((header, column) =>
      Math.max(header.length, ...rows.map((row) => row[column].length)),
    );
    const renderRow = (cells: string[]): string => cells
      .map((cell, column) => cell.padEnd(columnWidths[column]))
      .join(' | ');
    const tableLines = [
      renderRow(headers),
      columnWidths.map((width) => '-'.repeat(width)).join('-+-'),
      ...rows.map(renderRow),
    ];
    const lines = [
      'Execution Activity Log',
      `Execution ID: ${log.executionId}`,
      `Test Case ID: ${log.testCaseId}`,
      `Project: ${log.project}`,
      `Browser: ${log.browser}`,
      `Test Scope: ${log.testScope}`,
      `Attempt: ${log.attemptNumber} (retry index ${log.retryIndex})`,
      `Attempt Status: ${log.attemptStatus}`,
      `Logical Test Final Status: ${log.logicalTestFinalStatus || 'PENDING'}`,
      `Logical Test Outcome: ${log.logicalTestOutcome || 'PENDING'}`,
      `Started: ${log.startedAt}`,
      `Ended: ${log.endedAt}`,
      `Duration: ${log.durationMs} ms`,
      '',
      'Activities:',
      ...tableLines,
    ];
    if (log.steps.length === 0) lines.push('No qualifying test.step activities were recorded.');
    log.steps.forEach((step, index) => {
      if (step.failureMessage) lines.push(`Step ${index + 1} failure: ${step.failureMessage}`);
    });
    if (log.failureMessages.length > 0) {
      lines.push('', 'Test failure messages:');
      log.failureMessages.forEach((message) => lines.push(`  - ${message}`));
    }
    return `${lines.join('\n')}\n`;
  }

  private async releaseRetentionLock(): Promise<void> {
    if (!this.lockOwned) return;
    try {
      const ownerPath = path.join(this.lockPath, LOCK_OWNER_FILE);
      const recordedToken = await readFile(ownerPath, 'utf8');
      if (!this.lockToken || recordedToken !== this.lockToken) {
        this.diagnostic('Retention lock release skipped because ownership could not be verified.');
        return;
      }
      await unlink(ownerPath);
      await rmdir(this.lockPath);
      this.lockOwned = false;
      this.lockToken = '';
    } catch (error) {
      this.diagnostic(`Retention lock release failed (${this.errorCode(error)}); lock left in place.`);
    }
  }

  private diagnostic(message: string): void {
    console.warn(`[EvidenceReporter] ${message}`);
  }

  private errorCode(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code;
    return 'unknown error';
  }

  private readProject(metadata: Record<string, unknown> | undefined): string {
    const value = metadata?.evidenceProject;
    return typeof value === 'string' && value.trim()
      ? this.safeSegment(value.trim())
      : '';
  }

  private readTestCaseId(test: TestCase): string {
    const annotation = [...test.annotations].reverse().find(
      (item) => item.type === 'testCaseId' && item.description,
    );
    const title = [...test.titlePath(), test.title].join(' ');
    const match = title.match(/\b[A-Z0-9]+_TC_(?:[A-Z0-9]+_)*\d+\b/i)
      || annotation?.description?.match(/\b[A-Z0-9]+_TC_(?:[A-Z0-9]+_)*\d+\b/i);
    return match ? this.safeSegment(match[0].toUpperCase()) : 'NO_TEST_CASE_ID';
  }

  private safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 80) || 'UNASSIGNED';
  }

  private async copyScreenshots(result: TestResult, directory: string, status: EvidenceStatus): Promise<void> {
    const screenshots = result.attachments.filter((attachment) =>
      attachment.contentType.startsWith('image/')
      && (attachment.path || attachment.body),
    );
    const verificationPoints = screenshots.filter((attachment) =>
      attachment.name.toLowerCase().startsWith('verification-point-'),
    );
    const contextual = screenshots.filter((attachment) => !verificationPoints.includes(attachment));
    const primary = contextual[0] || screenshots[0];

    if (primary) {
      await this.saveAttachment(primary, path.join(directory, status === 'PASS' ? 'evidence.png' : 'failure.png'));
    }

    let verificationIndex = 0;
    for (const screenshot of verificationPoints) {
      verificationIndex += 1;
      await this.saveAttachment(screenshot, path.join(directory, `verification-${String(verificationIndex).padStart(2, '0')}.png`));
    }

    let contextIndex = 1;
    for (const screenshot of contextual.slice(1)) {
      contextIndex += 1;
      await this.saveAttachment(screenshot, path.join(directory, `context-${String(contextIndex).padStart(2, '0')}.png`));
    }
  }

  private async copyOtherEvidence(result: TestResult, directory: string): Promise<void> {
    let traceSaved = false;
    let videoIndex = 0;

    for (const attachment of result.attachments) {
      const name = attachment.name.toLowerCase();
      const extension = attachment.path ? path.extname(attachment.path).toLowerCase() : '';
      if ((name.includes('trace') || extension === '.zip') && (attachment.path || attachment.body) && !traceSaved) {
        await this.saveAttachment(attachment, path.join(directory, 'trace.zip'));
        traceSaved = true;
      } else if ((attachment.contentType.startsWith('video/') || extension === '.webm') && (attachment.path || attachment.body)) {
        videoIndex += 1;
        await this.saveAttachment(attachment, path.join(directory, videoIndex === 1 ? 'video.webm' : `video-${videoIndex}.webm`));
      }
    }
  }

  private async saveAttachment(
    attachment: TestResult['attachments'][number],
    destination: string,
  ): Promise<void> {
    if (attachment.body) {
      await writeFile(destination, attachment.body);
    } else if (attachment.path) {
      await copyFile(attachment.path, destination);
    }
  }

  private redact(value: string): string {
    let safeValue = value
      .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
      .replace(/\b(password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|authorization|cookie|secret|api[_-]?key)(\s*[:=]\s*)(["']?)[^\s,;"'}]+/gi, '$1$2[REDACTED]')
      .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, '[REDACTED_TOKEN]');

    for (const [key, secret] of Object.entries(process.env)) {
      if (secret && /password|token|secret|api[_-]?key|cookie|auth/i.test(key)) {
        safeValue = safeValue.split(secret).join('[REDACTED]');
      }
    }
    return safeValue;
  }
}
