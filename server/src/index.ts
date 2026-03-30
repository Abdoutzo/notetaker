import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';

import { cleanupWorkingDirectory, createWorkingDirectory, materializeInputAudio, prepareTranscriptionFiles } from './audio.js';
import { buildResponseCacheKey, getCachedResponse, getCachedTranscript, setCachedResponse, setCachedTranscript } from './cache.js';
import { config } from './config.js';
import { buildStructuredReport, transcribeAudio } from './openai-service.js';
import type { ProcessAudioInput } from './types.js';

const app = express();
const uploadDirectory = join(tmpdir(), 'memo-flux-server-uploads');
await mkdir(uploadDirectory, { recursive: true });

const upload = multer({
  dest: uploadDirectory,
  limits: {
    fileSize: config.maxUploadBytes,
  },
});

const bodySchema = z.object({
  template: z.enum(['meeting', 'field', 'memo']).default('meeting'),
  title: z.string().trim().optional(),
  recordedAt: z.string().trim().optional(),
  reportLanguage: z.enum(['fr', 'en']).default('en'),
  sourceUrl: z.string().url().optional(),
  cacheKey: z.string().trim().min(1).optional(),
});

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type JobRecord = {
  id: string;
  status: JobStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  result?: Awaited<ReturnType<typeof buildStructuredReport>>;
  error?: string;
};

const jobs = new Map<string, JobRecord>();
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

app.use(cors());
app.use((request, _response, next) => {
  console.log(`[HTTP] ${request.method} ${request.path} ${request.headers['content-type'] ?? ''}`.trim());
  next();
});
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    transcriptionModel: config.transcriptionModel,
    reportModel: config.reportModel,
  });
});

function createJob(id: string, message: string) {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id,
    status: 'queued',
    message,
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(id, job);
  return job;
}

function updateJob(id: string, updates: Partial<JobRecord>) {
  const current = jobs.get(id);

  if (!current) {
    return;
  }

  jobs.set(id, {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

function serializeJob(job: JobRecord) {
  return {
    jobId: job.id,
    status: job.status,
    message: job.message,
    ...(job.status === 'completed' && job.result ? { result: job.result } : {}),
    ...(job.status === 'failed' && job.error ? { error: job.error } : {}),
  };
}

function purgeOldJobs() {
  const now = Date.now();

  for (const [jobId, job] of jobs.entries()) {
    if (now - new Date(job.updatedAt).getTime() > JOB_RETENTION_MS) {
      jobs.delete(jobId);
    }
  }
}

setInterval(purgeOldJobs, 30 * 60 * 1000).unref?.();

function runMulterSingle(request: express.Request, response: express.Response) {
  return new Promise<void>((resolve, reject) => {
    upload.single('file')(request, response, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function runProcessingPipeline(params: {
  requestId: string;
  parsedBody: z.infer<typeof bodySchema>;
  uploadedFile?: Express.Multer.File;
  onProgress?: (message: string) => void;
}) {
  const cleanupPaths = new Set<string>();
  let workingDirectory: string | null = null;
  const { requestId, parsedBody, uploadedFile, onProgress } = params;

  try {
    const processingInput: ProcessAudioInput = {
      template: parsedBody.template,
      title: parsedBody.title,
      recordedAt: parsedBody.recordedAt,
      reportLanguage: parsedBody.reportLanguage,
    };

    const transcriptCacheKey = parsedBody.cacheKey ?? parsedBody.sourceUrl;
    const responseCacheKey = transcriptCacheKey
      ? buildResponseCacheKey({
          cacheKey: transcriptCacheKey,
          template: processingInput.template,
          reportLanguage: processingInput.reportLanguage,
          title: processingInput.title,
        })
      : null;

    if (responseCacheKey) {
      const cachedResponse = await getCachedResponse(responseCacheKey);
      if (cachedResponse) {
        console.log(`[${requestId}] response cache hit`);
        onProgress?.('Report already prepared. Returning cached result.');
        return {
          transcript: cachedResponse.transcript,
          report: cachedResponse.report,
          sourceLanguage: cachedResponse.sourceLanguage,
        };
      }
    }

    const cachedTranscript = transcriptCacheKey
      ? await getCachedTranscript(transcriptCacheKey)
      : null;

    let transcriptionResult = cachedTranscript
      ? {
          transcript: cachedTranscript.transcript,
          sourceLanguage: cachedTranscript.sourceLanguage,
        }
      : null;

    if (cachedTranscript) {
      console.log(
        `[${requestId}] transcript cache hit | segments=${cachedTranscript.transcript.length} | sourceLanguage=${cachedTranscript.sourceLanguage}`,
      );
      onProgress?.('Transcript cache hit. Drafting the report now.');
    }

    if (!transcriptionResult) {
      workingDirectory = await createWorkingDirectory();
      console.log(
        `[${requestId}] working directory created | template=${processingInput.template} | reportLanguage=${processingInput.reportLanguage}`,
      );
      onProgress?.('Preparing secure workspace for audio processing.');
      if (uploadedFile?.path) {
        cleanupPaths.add(uploadedFile.path);
      }

      console.log(`[${requestId}] materializing input audio`);
      onProgress?.('Fetching the source audio.');
      const inputPath = await materializeInputAudio({
        uploadedFile,
        sourceUrl: parsedBody.sourceUrl,
        workingDirectory,
      });

      console.log(`[${requestId}] preparing transcription files`);
      onProgress?.('Normalizing the audio for transcription.');
      const transcriptionFiles = await prepareTranscriptionFiles(inputPath, workingDirectory);
      console.log(`[${requestId}] transcription will use ${transcriptionFiles.length} file(s)`);
      onProgress?.(
        `Audio ready. Transcription will run in ${transcriptionFiles.length} chunk${transcriptionFiles.length > 1 ? 's' : ''}.`,
      );

      console.log(`[${requestId}] starting transcription`);
      transcriptionResult = await transcribeAudio(transcriptionFiles, (message) => {
        console.log(`[${requestId}] ${message}`);
        onProgress?.(message);
      });
      console.log(
        `[${requestId}] transcription finished | segments=${transcriptionResult.transcript.length} | sourceLanguage=${transcriptionResult.sourceLanguage}`,
      );
      onProgress?.('Transcription finished. Saving transcript cache.');

      if (transcriptCacheKey) {
        await setCachedTranscript(transcriptCacheKey, transcriptionResult);
        console.log(`[${requestId}] transcript cache saved`);
      }
    }

    console.log(`[${requestId}] generating structured report`);
    onProgress?.('Generating the structured report.');
    const structuredReport = await buildStructuredReport(
      processingInput,
      transcriptionResult.transcript,
      transcriptionResult.sourceLanguage,
    );
    console.log(`[${requestId}] report generation finished`);

    if (responseCacheKey) {
      await setCachedResponse(responseCacheKey, structuredReport);
      console.log(`[${requestId}] response cache saved`);
    }
    onProgress?.('Report finished.');
    return structuredReport;
  } finally {
    await Promise.all(
      [...cleanupPaths].map(async (filePath) => {
        await rm(filePath, { force: true });
      }),
    );

    if (workingDirectory) {
      await cleanupWorkingDirectory(workingDirectory);
    }
  }
}

app.get('/v1/reports/jobs/:jobId', (request, response) => {
  const job = jobs.get(request.params.jobId);

  if (!job) {
    response.status(404).json({
      error: 'Job not found.',
    });
    return;
  }

  response.json(serializeJob(job));
});

app.post('/v1/reports/process', async (request, response, next) => {
  const requestId = randomUUID();

  try {
    if (request.is('multipart/form-data')) {
      await runMulterSingle(request, response);
    }

    console.log(`[${requestId}] /v1/reports/process received`);
    const parsedBody = bodySchema.parse(request.body);
    if (!request.file && !parsedBody.sourceUrl) {
      response.status(400).json({
        error: 'Missing audio file or sourceUrl.',
      });
      return;
    }

    if (parsedBody.sourceUrl && !config.enableRemoteSourceUrls) {
      response.status(400).json({
        error: 'Remote source URLs are disabled on this server.',
      });
      return;
    }

    createJob(requestId, 'Job queued. Preparing the request.');
    response.status(202).json({
      jobId: requestId,
      status: 'queued',
      message: 'Job queued. Preparing the request.',
    });

    void runProcessingPipeline({
      requestId,
      parsedBody,
      uploadedFile: request.file,
      onProgress: (message) => {
        updateJob(requestId, {
          status: 'processing',
          message,
        });
      },
    })
      .then((result) => {
        updateJob(requestId, {
          status: 'completed',
          message: 'Report ready.',
          result,
        });
      })
      .catch((error) => {
        console.error('MemoFlux server error:', error);
        const sanitized = sanitizeServerError(error);
        updateJob(requestId, {
          status: 'failed',
          message: sanitized.message,
          error: sanitized.message,
        });
      });
  } catch (error) {
    next(error);
  }
});

function sanitizeServerError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : 'Internal server error.';
  const normalizedMessage = rawMessage.replace(/\s+/g, ' ').trim();

  if (
    /OPENAI_API_KEY|Headers\.append|invalid header value|authorization/i.test(normalizedMessage) ||
    /sk-[a-z0-9_-]+/i.test(normalizedMessage)
  ) {
    return {
      status: 500,
      message:
        'The server configuration is invalid. Check the OPENAI_API_KEY setting on the backend and paste only the raw key value.',
    };
  }

  if (/fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(normalizedMessage)) {
    return {
      status: 502,
      message: 'The server could not complete the request because an upstream service was unavailable. Try again.',
    };
  }

  return {
    status: 500,
    message: 'The server could not process this request. Try again in a moment.',
  };
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    response.status(400).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: 'Invalid request payload.',
      details: error.flatten(),
    });
    return;
  }

  console.error('MemoFlux server error:', error);
  const sanitized = sanitizeServerError(error);
  response.status(sanitized.status).json({
    error: sanitized.message,
    requestId: randomUUID(),
  });
});

app.listen(config.port, () => {
  console.log(`MemoFlux server listening on http://localhost:${config.port}`);
});
