import { Job, Worker } from "bullmq";
import type { ImageJobData } from "./utils/queue.js";
import redis from "./lib/redis.js";
import sharp, { type FormatEnum } from "sharp";
import path from "node:path";
import fs from "node:fs";
import { Asset, Batch } from "./prisma/db.js";

const batchWorker = new Worker('batch-summary', async (job) => {
  console.log(`\nAll children finished! Finalizing batch: ${job.data.batchId}`);

  await Batch.where({ id: job.data.batchId }).update({
    status: "COMPLETED"
  });
  
  const childrenValues = await job.getChildrenValues();
  console.log('Results from all images:', childrenValues);

  return {
    batchId: job.data.batchId,
    totalFiles: Object.keys(childrenValues).length,
    files: childrenValues,
  };
}, {
  connection: redis
})

const imageWorker = new Worker('image-processing', async (job: Job<ImageJobData>) => {
  const {batchId, inputPath, outputFormat} = job.data;

  console.log(`Processing file: ${inputPath} to format: ${outputFormat}`);

  const batchDir = path.resolve('outputs', batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  const baseName = path.parse(inputPath).name;
  const relativePath = path.join('outputs', batchId, `${baseName}.${outputFormat}`);
  const destination = path.resolve(relativePath);

  const info = await sharp(inputPath)
    .toFormat(outputFormat as keyof FormatEnum, {quality: 80})
    .toFile(destination)

  await Asset.create({
    batchId,
    originalPath: inputPath,
    outputPath: destination,
    fileSize: info.size,
    format: outputFormat
  });

  return { destination, size: info.size }
}, {
  connection: redis,
  concurrency: 4
});

imageWorker.on('completed', (job, returnvalue) => {
  console.log(`Job ${job.id} completed! Result:`, returnvalue);
});

imageWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

imageWorker.on('error', (err) => {
  console.error('Image worker error:', err);
});

batchWorker.on('completed', (job) => {
  console.log(`Batch job ${job.id} finalized successfully!`);
});

batchWorker.on('failed', (job, error) => {
  console.error(`Batch job ${job?.id} failed:`, error.message);
});

batchWorker.on('error', (err) => {
  console.error('Batch worker error:', err);
});

const workerShutdowm = async (signal: string) => {
  console.log(`\nRecieved ${signal}, shutting down workers...`);

  try {
    await Promise.all([
      imageWorker.close(),
      batchWorker.close()
    ]);

    process.exit(0);
  } catch (err) {
    console.error('Error during worker shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => workerShutdowm('SIGINT'));
process.on('SIGTERM', () => workerShutdowm('SIGTERM'));