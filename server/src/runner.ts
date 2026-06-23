import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

export class ContainerRunner {
  config: any;

  constructor(config) {
    this.config = config;
  }

  async run(job) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();

    const jobFile = path.join(job.artifactDir, 'job.json');
    await fs.writeFile(jobFile, JSON.stringify(job.payload), { mode: 0o600 });

    const args = this.buildArgs(job, jobFile);
    const child = spawn(this.config.containerRuntime, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const killTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, job.payload.timeoutMs + 10000);

    try {
      const [code, signal] = await once(child, 'exit');
      job.exitCode = code;
      await this.writeLog(job.artifactDir, 'stdout.log', stdout);
      await this.writeLog(job.artifactDir, 'stderr.log', stderr);

      if (code === 0) {
        job.status = 'succeeded';
      } else {
        job.status = 'failed';
        job.error = signal ? `runner exited via ${signal}` : `runner exited with code ${code}`;
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      throw error;
    } finally {
      clearTimeout(killTimer);
      await fs.rm(jobFile, { force: true });
      job.finishedAt = new Date().toISOString();
    }
  }

  buildArgs(job, jobFile) {
    const timeoutSeconds = Math.ceil((job.payload.timeoutMs + 10000) / 1000);
    const preset = runnerPresets[this.config.runnerPreset] || runnerPresets.balanced;
    return [
      'run',
      '--rm',
      '--init',
      '--network',
      this.config.network,
      '--memory',
      preset.memoryLimit || this.config.memoryLimit,
      '--cpus',
      preset.cpus || this.config.cpus,
      '--read-only',
      '--tmpfs',
      `/tmp:rw,noexec,nosuid,size=${preset.tmpSize}`,
      '--tmpfs',
      '/run:rw,noexec,nosuid,size=64m',
      '--tmpfs',
      `/home/pwuser:rw,nosuid,size=${preset.homeSize}`,
      '--tmpfs',
      `/dev/shm:rw,nosuid,nodev,size=${preset.shmSize}`,
      '--mount',
      `type=bind,src=${job.artifactDir},dst=/artifacts`,
      '--mount',
      `type=bind,src=${jobFile},dst=/work/job.json,readonly`,
      '--workdir',
      '/app',
      '--stop-timeout',
      '5',
      this.config.runnerImage,
      'timeout',
      `${timeoutSeconds}s`,
      'node',
      '/app/dist/run-job.js',
      '/work/job.json',
      '/artifacts'
    ];
  }

  async writeLog(dir, name, content) {
    if (!content) return;
    await fs.writeFile(path.join(dir, name), content.slice(-1024 * 1024), 'utf8');
  }
}

const runnerPresets = {
  'low-memory': {
    memoryLimit: '768m',
    cpus: '1',
    tmpSize: '256m',
    homeSize: '256m',
    shmSize: '128m'
  },
  balanced: {
    memoryLimit: null,
    cpus: null,
    tmpSize: '512m',
    homeSize: '512m',
    shmSize: '256m'
  },
  quality: {
    memoryLimit: '1536m',
    cpus: '2',
    tmpSize: '768m',
    homeSize: '768m',
    shmSize: '512m'
  }
};
