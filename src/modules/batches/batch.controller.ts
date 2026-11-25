import type { Request, Response } from "express";
import { ApiError } from "../../middleware/error.middleware.js";
import { createBatchJob } from "./batch.service.js";
import { batchQueue } from "../../utils/queue.js";
import path from "node:path";
import { ZipArchive } from "archiver";
import { Asset, Batch } from "../../prisma/db.js";
import redis from "../../lib/redis.js";
import { s3, s3Bucket } from "../../lib/s3.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

export const createBatch = async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    throw new ApiError('No files uploaded', 400)
  }

  const allowed = ['webp', 'avif', 'jpeg', 'png'];

  const outputFormat = req.body.outputFormat || 'webp';
  const quality = req.body.quality ? Number(req.body.quality) : 80;

  if(!allowed.includes(outputFormat)) {
    throw new ApiError(`Format must be one of: ${allowed.join(', ')}`, 400);
  }

  const batchId = await createBatchJob(files, outputFormat);

  await Batch.create({
    id: batchId,
    totalFiles: files.length
  })

  return res.status(200).json({
    status: 'queued',
    batchId,
    outputFormat
  });
}

export const getBatchStatus = async (req: Request, res: Response) => {
  const batchId = req.params.id;

  if (typeof batchId !== 'string') {
    throw new ApiError('Batch ID is required', 400);
  }

  const job = await batchQueue.getJob(batchId);
  if(!job) throw new ApiError('Batch not found', 404);

  const batch = await Batch.where({ id: batchId }).include('assets').first();
  if (!batch) throw new ApiError('Batch not found', 404);

  return res.status(200).json({
    batchId: batch.id,
    status: batch.status,
    totalFiles: batch.totalFiles,
    assets: batch.assets,
  });
}

export const downloadBatch = async (req: Request, res: Response) => {
  const batchId = req.params.id;

  if (typeof batchId !== 'string') {
    throw new ApiError('Batch ID is required', 400);
  }

  const batch = await Batch.where({ id: batchId }).include('assets').first();
  if (!batch) throw new ApiError('Batch not found', 404);

  if (batch.status !== 'COMPLETED') {
    throw new ApiError('Batch is still processing', 400);
  }

  res.attachment(`batch_${batchId}.zip`);

  const archive = new ZipArchive({ zlib: {level: 9}})

  archive.pipe(res);

  const files = await Promise.all(
    batch.assets.map(async (asset) => {
      const s3Response = await s3.send(
        new GetObjectCommand({
        Bucket: s3Bucket,
        Key: asset.outputPath
      }));

      const buffer = Buffer.from(await s3Response.Body!.transformToByteArray());

      return {
        name: path.basename(asset.outputPath),
        buffer
      };
    })
  );

  for(const file of files) {
    archive.append(file.buffer, { name: file.name });
  }
  
  await archive.finalize();
}

export const downloadFile = async (req: Request, res: Response) => {
  const { id: batchId, filename } = req.params;

  if (typeof batchId !== 'string' || typeof filename !== 'string') {
    throw new ApiError('Invalid parameters', 400);
  }

  const file = await Asset.where({ 
    batchId: batchId,
    outputPath: `outputs/${batchId}/${filename}`
  }).first();

  if(!file) {
    throw new ApiError(`No such file`, 404);
  }

  const s3Response = await s3.send(
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: file.outputPath
    })
  );

  res.attachment(filename);
  (s3Response.Body as NodeJS.ReadableStream).pipe(res);
}

export const streamBatchEvents = async (req: Request, res: Response) => {
  const batchId = req.params.id;

  if (typeof batchId !== 'string') {
    throw new ApiError('Batch ID is required', 400);
  }

  const batch = await Batch.where({ id: batchId }).first();
  if (!batch) {
    throw new ApiError('Batch not found', 404);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if(batch.status === 'COMPLETED') {
    res.write(`data: ${JSON.stringify({ type: 'completed', batchId })}\n\n`);
    res.end();
    return;
  }

  const subscriber = redis.duplicate();
  await subscriber.subscribe(`batch:${batchId}:events`);

  res.write(`data: ${JSON.stringify({ type: 'connected', batchId, totalFiles: batch.totalFiles })}\n\n`);

  subscriber.on('message', (channel, message) => {
    res.write(`data: ${message}\n\n`);

    const event = JSON.parse(message);
    if(event.type === 'completed') {
      subscriber.unsubscribe();
      subscriber.quit();
      res.end();
    }
  });

  req.on('close', () => {
    subscriber.unsubscribe();
    subscriber.quit();
  });
}

export const resizeImage = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new ApiError("No file uploaded", 400);
  }

  const width = req.body.width ? Number(req.body.width) : undefined;
  const height = req.body.height ? Number(req.body.height) : undefined;
  if (!width && !height) {
    throw new ApiError("Provide at least width or height", 400);
  }

  const resizedBuffer = await sharp(file.buffer)
    .resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();

  res.setHeader("Content-Type", file.mimetype);
  res.setHeader("Content-Disposition", `inline; filename="resized_${file.originalname}"`);
  return res.send(resizedBuffer);
}