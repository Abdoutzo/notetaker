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

app.post('/v1/reports/process', async (request, response, next) => {
  const cleanupPaths = new Set<string>();
  let workingDirectory: string | null = null;
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
        response.json({
          transcript: cachedResponse.transcript,
          report: cachedResponse.report,
          sourceLanguage: cachedResponse.sourceLanguage,
        });
        return;
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
    }

    if (!transcriptionResult) {
      workingDirectory = await createWorkingDirectory();
      console.log(
        `[${requestId}] working directory created | template=${processingInput.template} | reportLanguage=${processingInput.reportLanguage}`,
      );
      if (request.file?.path) {
        cleanupPaths.add(request.file.path);
      }

      console.log(`[${requestId}] materializing input audio`);
      const inputPath = await materializeInputAudio({
        uploadedFile: request.file,
        sourceUrl: parsedBody.sourceUrl,
        workingDirectory,
      });

      console.log(`[${requestId}] preparing transcription files`);
      const transcriptionFiles = await prepareTranscriptionFiles(inputPath, workingDirectory);
      console.log(`[${requestId}] transcription will use ${transcriptionFiles.length} file(s)`);

      console.log(`[${requestId}] starting transcription`);
      transcriptionResult = await transcribeAudio(transcriptionFiles, (message) => {
        console.log(`[${requestId}] ${message}`);
      });
      console.log(
        `[${requestId}] transcription finished | segments=${transcriptionResult.transcript.length} | sourceLanguage=${transcriptionResult.sourceLanguage}`,
      );

      if (transcriptCacheKey) {
        await setCachedTranscript(transcriptCacheKey, transcriptionResult);
        console.log(`[${requestId}] transcript cache saved`);
      }
    }

    console.log(`[${requestId}] generating structured report`);
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

    response.json(structuredReport);
  } catch (error) {
    next(error);
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
