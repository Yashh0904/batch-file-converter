import type { Request, Response } from "express";
import { ApiError } from "../../middleware/error.middleware.js";
import { createBatchJob } from "./batch.service.js";
import { batchQueue } from "../../utils/queue.js";
import path from "node:path";
import { existsSync } from "node:fs";
import { ZipArchive } from "archiver";
import { Batch } from "../../prisma/db.js";

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

  for(const asset of batch.assets) {
    if(existsSync(asset.outputPath)) {
      archive.file(asset.outputPath, { name: path.basename(asset.outputPath) });
    }
  }
  
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