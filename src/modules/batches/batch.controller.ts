import type { Request, Response } from "express";
import { ApiError } from "../../middleware/error.middleware.js";
import { createBatchJob } from "./batch.service.js";
import { batchQueue } from "../../utils/queue.js";
import path from "node:path";
import { existsSync } from "node:fs";
import { ZipArchive } from "archiver";

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

  if(!job) {
    throw new ApiError('Batch not found', 404);
  }

  const state = await job.getState();

  return res.status(200).json({
    batchId: job.id,
    status: state,
    result: job.returnvalue || null,
  });
}

export const downloadBatch = async (req: Request, res: Response) => {
  const batchId = req.params.id;

  if (typeof batchId !== 'string') {
    throw new ApiError('Batch ID is required', 400);
  }

  const batchDir = path.join(process.cwd(), 'outputs', batchId)

  res.attachment(`batch_${batchId}.zip`);

  const archive = new ZipArchive({ zlib: {level: 9}})

  archive.pipe(res);

  archive.directory(batchDir, false); 
  await archive.finalize();
}

export const downloadFile = async (req: Request, res: Response) => {
  const { id: batchId, filename } = req.params;

  if (typeof batchId !== 'string' || typeof filename !== 'string') {
    throw new ApiError('Invalid parameters', 400);
  }

  const filePath = path.join(process.cwd(), 'outputs', batchId, filename);

  if (!existsSync(filePath)) {
    throw new ApiError('File not found', 404);
  }

  return res.download(filePath, filename); 
}