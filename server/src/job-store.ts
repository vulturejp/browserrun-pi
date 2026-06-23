import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FingerprintProfile, JobAction, JobPayload } from './validation.js';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type JobRecord = {
  id: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  artifacts: string[];
  artifactDir: string;
  payload: JobPayload;
};

export type SerializedJob = Omit<JobRecord, 'artifactDir' | 'payload'> & {
  request: {
    url: string;
    timeoutMs: number;
    fingerprintProfile: string;
    actions: string[];
  };
};

export class JobStore {
  root: string;
  jobs: Map<string, JobRecord>;

  constructor(root: string) {
    this.root = root;
    this.jobs = new Map();
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true });
    await this.loadExisting();
  }

  async create(payload: JobPayload): Promise<JobRecord> {
    const id = crypto.randomUUID();
    const artifactDir = path.join(this.root, id);
    await fs.mkdir(artifactDir, { recursive: false });

    const job: JobRecord = {
      id,
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      error: null,
      artifacts: [],
      artifactDir,
      payload
    };
    this.jobs.set(id, job);
    await this.save(job);
    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  async listArtifacts(job: JobRecord): Promise<string[]> {
    const entries = await fs.readdir(job.artifactDir, { withFileTypes: true });
    job.artifacts = entries
      .filter((entry) => entry.isFile() && entry.name !== 'metadata.json' && entry.name !== 'job.json')
      .map((entry) => entry.name)
      .sort();
    return job.artifacts;
  }

  list(): JobRecord[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(job: JobRecord): Promise<void> {
    await this.listArtifacts(job).catch(() => {});
    await fs.writeFile(path.join(job.artifactDir, 'metadata.json'), JSON.stringify(this.serialize(job), null, 2), 'utf8');
  }

  serialize(job: JobRecord): SerializedJob {
    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      error: job.error,
      artifacts: job.artifacts,
      request: {
        url: job.payload.url,
        timeoutMs: job.payload.timeoutMs,
        fingerprintProfile: job.payload.fingerprintProfile,
        actions: job.payload.actions.map((action: JobAction) => action.type)
      }
    };
  }

  async loadExisting(): Promise<void> {
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const artifactDir = path.join(this.root, entry.name);
      const metadataPath = path.join(artifactDir, 'metadata.json');
      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as SerializedJob;
        const job: JobRecord = {
          id: metadata.id,
          status: metadata.status,
          createdAt: metadata.createdAt,
          startedAt: metadata.startedAt,
          finishedAt: metadata.finishedAt,
          exitCode: metadata.exitCode,
          error: metadata.error,
          artifacts: metadata.artifacts || [],
          artifactDir,
          payload: {
            url: metadata.request?.url || '',
            timeoutMs: metadata.request?.timeoutMs || 0,
            fingerprintProfile: normalizeFingerprintProfile(metadata.request?.fingerprintProfile),
            viewport: { width: 1280, height: 720 },
            headers: {},
            actions: (metadata.request?.actions || []).map((type: string) => ({ type }))
          }
        };
        this.jobs.set(job.id, job);
        await this.listArtifacts(job);
      } catch {
        // Ignore directories that are not browserrun-pi job artifacts.
      }
    }
  }
}

function normalizeFingerprintProfile(value: string | undefined): FingerprintProfile {
  return value === 'none' || value === 'mobile' || value === 'standard' ? value : 'standard';
}
