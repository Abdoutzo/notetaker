import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

import { config } from './config.js';

const SAFE_TRANSCRIPTION_BYTES = 24 * 1024 * 1024;

function ensureBinaryPath(value: string | null | undefined, label: string) {
  if (!value) {
    throw new Error(`${label} binary not available. Reinstall dependencies.`);
  }

  return value;
}

const resolvedFfmpegPath = ensureBinaryPath(ffmpegPath as unknown as string | null, 'ffmpeg');
const resolvedFfprobePath = ensureBinaryPath(ffprobe.path, 'ffprobe');

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const extension = extname(pathname);
    return extension || '.bin';
  } catch {
    return '.bin';
  }
}

async function downloadRemoteSource(sourceUrl: string, workingDirectory: string) {
  const url = new URL(sourceUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https source URLs are supported.');
  }

  const response = await fetch(sourceUrl);

  if (!response.ok || !response.body) {
    throw new Error(`Unable to download remote audio source: ${response.status} ${response.statusText}`);
  }

  const targetPath = join(workingDirectory, `remote-source${extensionFromUrl(sourceUrl)}`);
  await pipeline(
    Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream),
    createWriteStream(targetPath),
  );
  return targetPath;
}

async function normalizeAudioForTranscription(inputPath: string, outputPath: string) {
  await run(resolvedFfmpegPath, [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '48k',
    outputPath,
  ]);
}

async function segmentAudio(inputPath: string, workingDirectory: string) {
  const pattern = join(workingDirectory, 'segment-%03d.mp3');
  await run(resolvedFfmpegPath, [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '32k',
    '-f',
    'segment',
    '-segment_time',
    String(config.segmentSeconds),
    pattern,
  ]);

  const files = (await readdir(workingDirectory))
    .filter((fileName) => fileName.startsWith('segment-') && fileName.endsWith('.mp3'))
    .sort()
    .map((fileName, index) => ({
      path: join(workingDirectory, fileName),
      offsetMs: index * config.segmentSeconds * 1000,
    }));

  if (!files.length) {
    throw new Error('Audio segmentation failed.');
  }

  return files;
}

async function readDurationSeconds(filePath: string) {
  return new Promise<number>((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ];

    const child = spawn(resolvedFfprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
        return;
      }

      const duration = Number(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('Unable to read audio duration.'));
        return;
      }

      resolve(duration);
    });
  });
}

export async function createWorkingDirectory() {
  return mkdtemp(join(tmpdir(), 'memo-flux-server-'));
}

export async function cleanupWorkingDirectory(workingDirectory: string) {
  await rm(workingDirectory, { recursive: true, force: true });
}

export async function materializeInputAudio(params: {
  uploadedFile?: Express.Multer.File;
  sourceUrl?: string;
  workingDirectory: string;
}) {
  const { uploadedFile, sourceUrl, workingDirectory } = params;

  if (uploadedFile?.path && (await pathExists(uploadedFile.path))) {
    return uploadedFile.path;
  }

  if (sourceUrl) {
    return downloadRemoteSource(sourceUrl, workingDirectory);
  }

  throw new Error('Missing audio file or source URL.');
}

export async function prepareTranscriptionFiles(inputPath: string, workingDirectory: string) {
  const normalizedPath = join(workingDirectory, `normalized-${randomUUID()}.mp3`);
  await normalizeAudioForTranscription(inputPath, normalizedPath);

  const normalizedStats = await stat(normalizedPath);
  if (normalizedStats.size <= SAFE_TRANSCRIPTION_BYTES) {
    return [{ path: normalizedPath, offsetMs: 0 }];
  }

  return segmentAudio(normalizedPath, workingDirectory);
}

export async function describeAudio(filePath: string) {
  const fileStats = await stat(filePath);
  const durationSeconds = await readDurationSeconds(filePath);

  return {
    fileName: basename(filePath),
    sizeBytes: fileStats.size,
    durationMs: Math.round(durationSeconds * 1000),
  };
}
