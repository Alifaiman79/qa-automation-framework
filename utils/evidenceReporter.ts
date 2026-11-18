import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

type EvidenceStatus = 'PASS' | 'FAIL';

export default class EvidenceReporter implements Reporter {
  private configProject = 'UNASSIGNED';

  onBegin(config: FullConfig): void {
    this.configProject = this.readProject(config.metadata) || 'UNASSIGNED';
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (result.status === 'skipped') return;

    try {
      const projectMetadata = test.parent.project()?.metadata;
      const projectAnnotation = [...test.annotations].reverse().find(
        (annotation) => annotation.type === 'evidenceProject' && annotation.description,
      );
      const project = this.readProject({ evidenceProject: projectAnnotation?.description })
        || this.readProject(projectMetadata)
        || this.configProject;
      const testCaseId = this.readTestCaseId(test);
      const browser = this.safeSegment(test.parent.project()?.name || 'UNASSIGNED');
      const status: EvidenceStatus = result.status === 'passed' ? 'PASS' : 'FAIL';
      const timestamp = result.startTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const uniqueRunId = randomBytes(4).toString('hex');
      const attempt = `ATTEMPT_${result.retry}`;
      const evidenceDirectory = path.join(
        process.cwd(),
        'test-evidence',
        status,
        project,
        browser,
        testCaseId,
        `${timestamp}-${uniqueRunId}`,
        attempt,
      );

      await mkdir(evidenceDirectory, { recursive: true });
      await this.copyScreenshots(result, evidenceDirectory, status);

      if (status === 'FAIL') {
        const details = result.errors.map((error) => error.message || error.stack || 'Unspecified test failure');
        await writeFile(path.join(evidenceDirectory, 'error.txt'), this.redact(details.join('\n\n')), 'utf8');
      }

      await this.copyOtherEvidence(result, evidenceDirectory);
    } catch {
      // Evidence collection is best effort and must never change the Playwright test result.
    }
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
