// Isolated Phase 5 reporter validation. All generated files stay in a fresh OS temporary directory.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');

const repository = path.resolve(__dirname, '..', '..');
const reporterPath = path.join(repository, 'utils', 'evidenceReporter.ts');
const cliPath = path.join(repository, 'node_modules', '@playwright', 'test', 'cli.js');
const playwrightModule = require.resolve('@playwright/test');
const originalCwd = process.cwd();
const originalRetention = process.env.EVIDENCE_RETENTION_ENABLED;
const counters = { passed: 0, failed: 0, blocked: 0 };
const blockedReasons = [];

function verify(label, assertion) {
  try {
    assertion();
    counters.passed += 1;
  } catch {
    counters.failed += 1;
    throw new Error(label);
  }
}

function loadActualReporter() {
  const source = fs.readFileSync(reporterPath, 'utf8');
  const stripped = Module.stripTypeScriptTypes(source, { mode: 'transform' });
  const compiled = stripped
    .replace(/^import \{ randomBytes \} from 'node:crypto';/m,
      "const { randomBytes } = require('node:crypto');")
    .replace(/^import \{ ([^\n]+) \} from 'node:fs\/promises';/m,
      "const { $1 } = require('node:fs/promises');")
    .replace(/^import path from 'node:path';/m, "const path = require('node:path');")
    .replace(/^export async function pruneEvidenceForKey/m, 'async function pruneEvidenceForKey')
    .replace(/^export default class EvidenceReporter/m, 'class EvidenceReporter')
    + '\nmodule.exports = { default: EvidenceReporter, pruneEvidenceForKey };\n';
  const loaded = new Module(reporterPath, module);
  loaded.filename = reporterPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(reporterPath));
  loaded._compile(compiled, reporterPath);
  return loaded.exports.default;
}

const EvidenceReporter = loadActualReporter();

function fakeTest(number, title, outcome, options = {}) {
  const annotations = options.annotations || [];
  return {
    id: `synthetic-${number}-${randomUUID()}`,
    title,
    titlePath: () => ['', title],
    annotations,
    parent: { project: () => ({ name: options.browser || 'chromium',
      metadata: { evidenceProject: 'portfolio-demo' } }) },
    repeatEachIndex: options.repeatEachIndex || 0,
    expectedStatus: options.expectedStatus || 'passed',
    results: [],
    outcome: () => outcome,
  };
}

function fakeResult(status, retry = 0, sentinel = '') {
  return {
    status, retry, startTime: new Date(), duration: 12,
    errors: status === 'passed' || status === 'skipped' ? [] :
      [{ message: `Synthetic failure ${sentinel}`, stack: `Synthetic stack ${sentinel}` }],
    attachments: [],
    stdout: [sentinel],
    stderr: [sentinel],
  };
}

async function simulate(directory, suiteName, tests, attempts, overallStatus, retention = false, globalErrors = 0) {
  fs.mkdirSync(directory, { recursive: true });
  process.chdir(directory);
  process.env.EVIDENCE_RETENTION_ENABLED = retention ? 'true' : 'false';
  const reporter = new EvidenceReporter();
  await reporter.onBegin({
    metadata: { evidenceProject: 'portfolio-demo' },
    configFile: path.join(repository, suiteName),
  }, { allTests: () => tests });
  for (let i = 0; i < globalErrors; i += 1) reporter.onError();
  for (const [test, records] of attempts) {
    for (const { result, started = true } of records) {
      test.results.push(result);
      if (started) reporter.onTestBegin(test, result);
      await reporter.onTestEnd(test, result);
    }
  }
  const fullResult = { status: overallStatus, startTime: new Date(), duration: 250 };
  await reporter.onEnd(fullResult);
  return { reporter, fullResult };
}

function summaryDirectories(directory, suite) {
  const suiteDir = path.join(directory, 'run-summaries', suite);
  return fs.existsSync(suiteDir)
    ? fs.readdirSync(suiteDir).filter((name) => !name.startsWith('.pending-')).map((name) => path.join(suiteDir, name))
    : [];
}

function readSummary(directory) {
  const jsonPath = path.join(directory, 'execution-summary.json');
  const textPath = path.join(directory, 'execution-summary.txt');
  verify('JSON summary exists', () => assert.equal(fs.existsSync(jsonPath), true));
  verify('Text summary exists', () => assert.equal(fs.existsSync(textPath), true));
  return { json: JSON.parse(fs.readFileSync(jsonPath, 'utf8')), text: fs.readFileSync(textPath, 'utf8') };
}

function checkCounts(summary) {
  const { counts, tests } = summary.json;
  verify('Logical categories sum to total', () => assert.equal(
    counts.passed + counts.failed + counts.flaky + counts.skipped + counts.interrupted + counts.unexecuted,
    counts.total,
  ));
  verify('Test records match total', () => assert.equal(tests.length, counts.total));
  verify('Attempt count matches records', () => assert.equal(
    tests.reduce((sum, test) => sum + test.attempts, 0), counts.totalAttempts,
  ));
  verify('Retry count matches records', () => assert.equal(
    tests.reduce((sum, test) => sum + test.retryAttempts, 0), counts.retryAttempts,
  ));
  verify('Text total matches JSON', () => assert.ok(summary.text.includes(`Logical tests: ${counts.total}`)));
  verify('Text attempt count matches JSON', () => assert.ok(summary.text.includes(`Attempts: ${counts.totalAttempts}`)));
}

async function simulatedCoverage(root) {
  const sentinels = [
    'SYNTHETIC_PASSWORD_VALUE', 'SYNTHETIC_SESSION_TOKEN_VALUE',
    'https://synthetic.invalid/private', 'C:\\synthetic\\private\\file',
    'Cookie: synthetic_cookie_value', 'Authorization: Bearer synthetic_token_value',
  ];
  const sentinel = sentinels.join(' | ');
  const tests = [
    fakeTest(1, `SIM_TC_001 pass ${sentinel}`, 'expected', {
      annotations: [{ type: 'testCaseId', description: 'SIM_TC_901' }, { type: 'testScope', description: sentinel }],
    }),
    fakeTest(2, 'SIM_TC_002 final failure', 'unexpected'),
    fakeTest(3, 'SIM_TC_003 flaky', 'flaky', {
      annotations: [{ type: 'testCaseId', description: 'invalid/annotation' }],
    }),
    fakeTest(4, `No valid identifier ${sentinel}`, 'skipped', { expectedStatus: 'skipped' }),
    fakeTest(5, 'SIM_TC_005 expected failure', 'expected', { expectedStatus: 'failed' }),
    fakeTest(6, 'SIM_TC_006 unexpected pass', 'unexpected', { expectedStatus: 'failed' }),
    fakeTest(7, 'SIM_TC_007 timeout', 'unexpected'),
  ];
  const attempts = [
    [tests[0], [{ result: fakeResult('passed', 0, sentinel) }]],
    [tests[1], [{ result: fakeResult('failed', 0, sentinel) }]],
    [tests[2], [{ result: fakeResult('failed', 0, sentinel) },
      { result: fakeResult('passed', 1, sentinel) }]],
    [tests[3], [{ result: fakeResult('skipped'), started: false }]],
    [tests[4], [{ result: fakeResult('failed', 0, sentinel) }]],
    [tests[5], [{ result: fakeResult('passed') }]],
    [tests[6], [{ result: fakeResult('timedOut', 0, sentinel) }]],
  ];
  const directory = path.join(root, 'simulated');
  await simulate(directory, 'playwright.integration.config.ts', tests, attempts, 'failed', true);
  const first = summaryDirectories(directory, 'integration');
  verify('Fixed integration suite label', () => assert.equal(first.length, 1));
  const summary = readSummary(first[0]);
  checkCounts(summary);
  verify('Schema version', () => assert.equal(summary.json.schemaVersion, 1));
  verify('Actual overall status preserved', () => assert.equal(summary.json.overallStatus, 'failed'));
  verify('Run is complete', () => assert.equal(summary.json.complete, true));
  verify('Logical outcome mapping', () => assert.deepEqual(
    [summary.json.counts.passed, summary.json.counts.failed, summary.json.counts.flaky, summary.json.counts.skipped],
    [2, 3, 1, 1],
  ));
  verify('Attempts and retries', () => assert.deepEqual(
    [summary.json.counts.totalAttempts, summary.json.counts.retryAttempts], [7, 1],
  ));
  verify('Approved pass-rate formula', () => assert.equal(summary.json.counts.passRate, 50));
  verify('Wall and summed test durations differ', () => assert.notEqual(
    summary.json.wallDurationMs, summary.json.tests.reduce((sum, test) => sum + test.durationMs, 0),
  ));
  verify('Annotation-first conflict preserves legacy evidence ID', () => assert.deepEqual(
    [summary.json.tests[0].testCaseId, summary.json.tests[0].caseIdQuality, summary.json.tests[0].legacyEvidenceId],
    ['SIM_TC_901', 'conflict', 'SIM_TC_001'],
  ));
  verify('Invalid annotation falls back to title', () => assert.deepEqual(
    [summary.json.tests[2].testCaseId, summary.json.tests[2].caseIdQuality],
    ['SIM_TC_003', 'invalid-annotation'],
  ));
  verify('Missing case ID stays null', () => assert.equal(summary.json.tests[3].testCaseId, null));
  verify('Title fallback is identified', () => assert.equal(summary.json.tests[1].caseIdQuality, 'title'));
  verify('Expected failure retains physical failure', () => assert.deepEqual(
    [summary.json.tests[4].outcome, summary.json.tests[4].finalAttemptStatus, summary.json.tests[4].expectedStatus],
    ['passed', 'failed', 'failed'],
  ));
  verify('Unexpected pass retains physical pass', () => assert.deepEqual(
    [summary.json.tests[5].outcome, summary.json.tests[5].finalAttemptStatus], ['failed', 'passed'],
  ));
  verify('Flaky success is separate from passed', () => assert.deepEqual(
    [summary.json.tests[2].outcome, summary.json.tests[2].attempts, summary.json.tests[2].retryAttempts],
    ['flaky', 2, 1],
  ));
  verify('Evidence references have completion markers', () => {
    for (const test of summary.json.tests) for (const reference of test.evidence) {
      assert.equal(fs.existsSync(path.join(directory, 'test-evidence', reference, 'attempt-complete.json')), true);
    }
  });
  verify('Existing title-first evidence path remains', () => assert.ok(
    summary.json.tests[0].evidence.every((reference) => reference.includes('/SIM_TC_001/')),
  ));
  const raw = fs.readFileSync(path.join(first[0], 'execution-summary.json'), 'utf8') + summary.text;
  verify('Synthetic title and error sentinels absent', () => assert.ok(
    sentinels.every((value) => !raw.includes(value)),
  ));
  verify('Malformed annotation absent', () => assert.equal(raw.includes('invalid/annotation'), false));
  verify('No raw URL or absolute path in summaries', () => assert.equal(
    /https?:\/\/|[A-Za-z]:\\|Authorization:|Cookie:/i.test(raw), false,
  ));
  verify('Retention marker exists for completed evidence', () => assert.equal(
    fs.existsSync(path.join(directory, 'test-evidence', 'PASS', 'portfolio-demo', 'chromium',
      'SIM_TC_001', summary.json.tests[0].evidence[0].split('/')[4], 'execution-complete.json')), true,
  ));

  await simulate(directory, 'playwright.integration.config.ts', tests, attempts, 'failed', false);
  const second = summaryDirectories(directory, 'integration');
  verify('Second invocation retains first summary', () => assert.equal(second.length, 2));
  verify('Invocation summary IDs are unique', () => assert.notEqual(
    readSummary(second[0]).json.summaryId, readSummary(second[1]).json.summaryId,
  ));
  verify('Retention-disabled summary exists', () => assert.ok(second.every((item) =>
    fs.existsSync(path.join(item, 'execution-summary.json')))));

  const pending = [
    fakeTest(8, 'SIM_TC_008 completed', 'expected'),
    fakeTest(9, 'SIM_TC_009 no result', 'skipped'),
    fakeTest(10, 'SIM_TC_010 interrupted', 'unexpected'),
    fakeTest(11, 'SIM_TC_011 synthetic skip', 'skipped'),
    fakeTest(12, 'SIM_TC_012 explicit skip', 'skipped', { expectedStatus: 'skipped' }),
  ];
  const incompleteDir = path.join(root, 'incomplete');
  await simulate(incompleteDir, 'playwright.auth.config.ts', pending, [
    [pending[0], [{ result: fakeResult('passed') }]],
    [pending[2], [{ result: fakeResult('interrupted') }]],
    [pending[3], [{ result: fakeResult('skipped'), started: false }]],
    [pending[4], [{ result: fakeResult('skipped'), started: false }]],
  ], 'interrupted', false, 1);
  const incomplete = readSummary(summaryDirectories(incompleteDir, 'auth')[0]);
  checkCounts(incomplete);
  verify('Interrupted and unexecuted distinguished conservatively', () => assert.deepEqual(
    [incomplete.json.counts.interrupted, incomplete.json.counts.unexecuted, incomplete.json.counts.skipped],
    [1, 2, 1],
  ));
  verify('Incomplete run has null pass rate', () => assert.equal(incomplete.json.counts.passRate, null));
  verify('Global error count and overall status retained', () => assert.deepEqual(
    [incomplete.json.globalErrorCount, incomplete.json.overallStatus, incomplete.json.complete],
    [1, 'interrupted', false],
  ));

  const emptyDir = path.join(root, 'empty');
  await simulate(emptyDir, 'unknown.config.ts', [], [], 'failed');
  const empty = readSummary(summaryDirectories(emptyDir, 'other')[0]);
  verify('Empty run is not complete', () => assert.deepEqual(
    [empty.json.counts.total, empty.json.counts.passRate, empty.json.complete], [0, null, false],
  ));

  const duplicates = [
    fakeTest(13, 'SIM_TC_013 first', 'expected'),
    fakeTest(14, 'SIM_TC_013 second', 'expected', { repeatEachIndex: 1 }),
    fakeTest(15, 'SIM_TC_013 another browser', 'expected', { browser: 'firefox' }),
  ];
  const duplicateDir = path.join(root, 'duplicates');
  await simulate(duplicateDir, 'playwright.config.ts', duplicates,
    duplicates.map((test) => [test, [{ result: fakeResult('passed') }]]), 'passed');
  const duplicate = readSummary(summaryDirectories(duplicateDir, 'default')[0]);
  checkCounts(duplicate);
  verify('Repeated and duplicate logical tests remain separate', () => assert.deepEqual(
    [duplicate.json.counts.total, duplicate.json.tests[1].repeatEachIndex,
      duplicate.json.tests[0].duplicateRetentionKey, duplicate.json.tests[1].duplicateRetentionKey,
      duplicate.json.tests[2].duplicateRetentionKey],
    [3, 1, true, true, false],
  ));
}

async function scopeCoverage(root) {
  const allowed = ['AUTHENTICATION', 'RBAC', 'SMOKE', 'API', 'API_UI_INTEGRATION', 'AUTH'];
  const sensitiveScope = 'Authorization: Bearer SYNTHETIC_SCOPE_TOKEN';
  const scopes = [...allowed, sensitiveScope];
  const tests = scopes.map((scope, index) => fakeTest(20 + index,
    `SCOPE_TC_${String(index + 1).padStart(3, '0')} scope validation`, 'expected', {
      annotations: [
        { type: 'testCaseId', description: `SCOPE_TC_${String(index + 1).padStart(3, '0')}` },
        { type: 'testScope', description: scope },
      ],
    }));
  const directory = path.join(root, 'scope-validation');
  await simulate(directory, 'playwright.integration.config.ts', tests,
    tests.map((test) => [test, [{ result: fakeResult('passed') }]]), 'passed');
  const summary = readSummary(summaryDirectories(directory, 'integration')[0]);
  checkCounts(summary);
  for (const [index, scope] of allowed.entries()) {
    verify(`Approved scope ${index + 1} retained`, () => assert.equal(summary.json.tests[index].scope, scope));
  }
  verify('Arbitrary sensitive scope serializes as null', () => assert.equal(
    summary.json.tests[allowed.length].scope, null,
  ));
  const jsonText = fs.readFileSync(path.join(summaryDirectories(directory, 'integration')[0],
    'execution-summary.json'), 'utf8');
  verify('Sensitive scope absent from both summary formats', () => assert.ok(
    !jsonText.includes(sensitiveScope) && !summary.text.includes(sensitiveScope),
  ));
  verify('Text summary case lines agree with JSON', () => assert.ok(summary.json.tests.every((test) =>
    summary.text.includes(`${test.recordIndex}. ${test.testCaseId}: ${test.outcome} (${test.attempts} attempts)`))));
  verify('Text summary does not claim a scope field', () => assert.equal(summary.text.includes('Scope:'), false));
}

async function failureAndSymlinkCoverage(root) {
  const failureDir = path.join(root, 'write-failure');
  fs.mkdirSync(failureDir);
  process.chdir(failureDir);
  const originalWrite = fsp.writeFile;
  const originalWarn = console.warn;
  const diagnostics = [];
  fsp.writeFile = async (...args) => {
    if (String(args[0]).endsWith('execution-summary.txt')) throw Object.assign(new Error('synthetic'), { code: 'EACCES' });
    return originalWrite(...args);
  };
  console.warn = (message) => diagnostics.push(message);
  const result = { status: 'passed', startTime: new Date(), duration: 1 };
  try {
    const FailureReporter = loadActualReporter();
    const reporter = new FailureReporter();
    await reporter.onBegin({ metadata: {}, configFile: 'playwright.config.ts' }, { allTests: () => [] });
    await reporter.onEnd(result);
  }
  finally { fsp.writeFile = originalWrite; console.warn = originalWarn; }
  verify('Summary write failure preserves result', () => assert.equal(result.status, 'passed'));
  verify('Summary write failure has fixed diagnostic', () => assert.ok(
    diagnostics.some((message) => message ===
      '[EvidenceReporter] Execution summary write failed; no finalized summary was published.'),
  ));
  verify('Partial write has no finalized directory', () => assert.equal(
    summaryDirectories(failureDir, 'default').length, 0,
  ));

  for (const intermediate of [false, true]) {
    const caseDir = path.join(root, intermediate ? 'intermediate-link' : 'root-link');
    const target = path.join(caseDir, 'target');
    fs.mkdirSync(target, { recursive: true });
    const summaryRoot = path.join(caseDir, 'run-summaries');
    if (intermediate) fs.mkdirSync(summaryRoot);
    const link = intermediate ? path.join(summaryRoot, 'default') : summaryRoot;
    try {
      fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
        counters.blocked += 1;
        blockedReasons.push(`Symlink test blocked: ${error.code}`);
        continue;
      }
      throw error;
    }
    process.chdir(caseDir);
    const linkedReporter = new EvidenceReporter();
    await linkedReporter.onBegin({ metadata: {}, configFile: 'playwright.config.ts' }, { allTests: () => [] });
    const messages = [];
    console.warn = (message) => messages.push(message);
    try { await linkedReporter.onEnd({ status: 'passed', startTime: new Date(), duration: 1 }); }
    finally { console.warn = originalWarn; }
    verify('Symlinked summary path rejected', () => assert.ok(messages.some(
      (message) => message.includes('Execution summary write failed; no finalized summary was published.'),
    )));
    verify('Symlink target has no summary files', () => assert.deepEqual(fs.readdirSync(target), []));
  }
}

async function concurrentCallbackCoverage(root) {
  const directory = path.join(root, 'concurrent-callbacks');
  fs.mkdirSync(directory);
  process.chdir(directory);
  process.env.EVIDENCE_RETENTION_ENABLED = 'false';
  const tests = [
    fakeTest(16, 'SIM_TC_016 concurrent first', 'expected'),
    fakeTest(17, 'SIM_TC_017 concurrent second', 'expected'),
  ];
  const reporter = new EvidenceReporter();
  await reporter.onBegin({ metadata: { evidenceProject: 'portfolio-demo' },
    configFile: 'playwright.integration.config.ts' }, { allTests: () => tests });
  const results = tests.map(() => fakeResult('passed'));
  tests.forEach((test, index) => {
    test.results.push(results[index]);
    reporter.onTestBegin(test, results[index]);
  });
  await Promise.all(tests.map((test, index) => reporter.onTestEnd(test, results[index])));
  await reporter.onEnd({ status: 'passed', startTime: new Date(), duration: 100 });
  const summary = readSummary(summaryDirectories(directory, 'integration')[0]);
  checkCounts(summary);
  verify('Concurrent callbacks retain two logical tests', () => assert.deepEqual(
    [summary.json.counts.total, summary.json.counts.passed, summary.json.counts.totalAttempts], [2, 2, 2],
  ));
  verify('Concurrent callbacks retain separate evidence IDs', () => assert.notEqual(
    summary.json.tests[0].evidence[0], summary.json.tests[1].evidence[0],
  ));
}

function actualPlaywrightCoverage(root) {
  const directory = path.join(root, 'actual-playwright');
  fs.mkdirSync(directory);
  const config = path.join(directory, 'playwright.config.cjs');
  const spec = path.join(directory, 'synthetic.spec.cjs');
  fs.writeFileSync(config, `const { defineConfig } = require(${JSON.stringify(playwrightModule)});
module.exports = defineConfig({
  testDir: ${JSON.stringify(directory)}, testMatch: '**/synthetic.spec.cjs',
  outputDir: ${JSON.stringify(path.join(directory, 'results'))},
  retries: 1, workers: 2, fullyParallel: true,
  reporter: [[${JSON.stringify(reporterPath)}]],
});`);
  fs.writeFileSync(spec, `const { test } = require(${JSON.stringify(playwrightModule)});
const details = (id) => ({ annotation: [{ type: 'testCaseId', description: id },
  { type: 'testScope', description: 'API' }] });
test('RUN_TC_001 pass', details('RUN_TC_001'), async () => {});
test('RUN_TC_002 fail', details('RUN_TC_002'), async () => { throw new Error('Synthetic failure'); });
test('RUN_TC_003 flaky', details('RUN_TC_003'), async ({}, info) => {
  if (info.retry === 0) throw new Error('Synthetic first-attempt failure');
});
test('RUN_TC_004 skipped', details('RUN_TC_004'), async () => { test.skip(); });
test('RUN_TC_005 expected failure', details('RUN_TC_005'), async () => {
  test.fail(); throw new Error('Synthetic expected failure');
});
test('RUN_TC_006 unexpected pass', details('RUN_TC_006'), async () => { test.fail(); });
test('RUN_TC_007 timeout', details('RUN_TC_007'), async () => {
  test.setTimeout(100); await new Promise(() => {});
});`);
  const safeEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
    if (process.env[key]) safeEnv[key] = process.env[key];
  }
  safeEnv.EVIDENCE_RETENTION_ENABLED = 'false';
  const run = spawnSync(process.execPath, [cliPath, 'test', '-c', config, '--repeat-each=2',
    '--workers=2', '--retries=1'], {
    cwd: directory, env: safeEnv, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  if (run.error) {
    if (['EPERM', 'EACCES', 'ETIMEDOUT'].includes(run.error.code)) {
      counters.blocked += 1;
      blockedReasons.push(`Synthetic Playwright process blocked: ${run.error.code}`);
      return;
    }
    throw new Error('Synthetic Playwright process could not start');
  }
  verify('Expected synthetic failures preserve nonzero Playwright exit', () => assert.notEqual(run.status, 0));
  const directories = summaryDirectories(directory, 'other');
  verify('Actual Playwright invocation produced one summary', () => assert.equal(directories.length, 1));
  const summary = readSummary(directories[0]);
  checkCounts(summary);
  verify('Actual Playwright discovered repeated cases separately', () => assert.equal(summary.json.counts.total, 14));
  verify('Actual Playwright overall status preserved', () => assert.equal(summary.json.overallStatus, 'failed'));
  verify('Actual Playwright exercised retries', () => assert.ok(summary.json.counts.retryAttempts > 0));
  verify('Actual Playwright produced flaky outcome', () => assert.ok(summary.json.counts.flaky > 0));
  verify('Actual Playwright preserved expected failure', () => assert.ok(summary.json.tests.some(
    (test) => test.expectedStatus === 'failed' && test.finalAttemptStatus === 'failed' && test.outcome === 'passed',
  )));
  verify('Actual Playwright preserved unexpected pass', () => assert.ok(summary.json.tests.some(
    (test) => test.expectedStatus === 'failed' && test.finalAttemptStatus === 'passed' && test.outcome === 'failed',
  )));
  verify('Actual Playwright preserved timeout', () => assert.ok(summary.json.tests.some(
    (test) => test.finalAttemptStatus === 'timedOut' && test.outcome === 'failed',
  )));
  verify('Actual Playwright repeated indexes are separate', () => assert.deepEqual(
    [...new Set(summary.json.tests.map((test) => test.repeatEachIndex))].sort(), [0, 1],
  ));
  verify('Actual Playwright duplicate retention keys flagged', () => assert.ok(
    summary.json.tests.some((test) => test.duplicateRetentionKey),
  ));
}

async function main() {
  const ownedRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'qa-summary-validation-'));
  let cleanupFailed = false;
  try {
    await simulatedCoverage(ownedRoot);
    await scopeCoverage(ownedRoot);
    await failureAndSymlinkCoverage(ownedRoot);
    await concurrentCallbackCoverage(ownedRoot);
    actualPlaywrightCoverage(ownedRoot);
  } finally {
    process.chdir(originalCwd);
    if (originalRetention === undefined) delete process.env.EVIDENCE_RETENTION_ENABLED;
    else process.env.EVIDENCE_RETENTION_ENABLED = originalRetention;
    if (ownedRoot.startsWith(path.join(os.tmpdir(), 'qa-summary-validation-'))) {
      try { await fsp.rm(ownedRoot, { recursive: true, force: false }); }
      catch { cleanupFailed = true; }
    } else cleanupFailed = true;
  }
  if (cleanupFailed) { counters.failed += 1; throw new Error('Temporary cleanup failed'); }
  console.log(`Synthetic reporter validation: ${counters.passed} passed, ${counters.failed} failed, ${counters.blocked} blocked.`);
  for (const reason of blockedReasons) console.log(reason);
}

main().catch((error) => {
  const label = error && typeof error.message === 'string' && !/[\\/]|SYNTHETIC|https?:/i.test(error.message)
    ? error.message : 'Unexpected harness failure';
  console.error(`Synthetic reporter validation failed: ${label}. ${counters.passed} passed, ${Math.max(counters.failed, 1)} failed, ${counters.blocked} blocked.`);
  process.exitCode = 1;
});
