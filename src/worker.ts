import { Job, Worker } from "bullmq";
import type { ImageJobData } from "./utils/queue.js";
import redis from "./lib/redis.js";
import sharp, { type FormatEnum } from "sharp";
import path from "node:path";
import fs from "node:fs";

const outputDir = path.resolve('./outputs');

const batchWorker = new Worker('batch-summary', async (job) => {
  console.log(`\nAll children finished! Finalizing batch: ${job.data.batchId}`);
  
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

  const batchDir = path.join(outputDir, batchId);
  if (!fs.existsSync(batchDir)) {
    fs.mkdirSync(batchDir, { recursive: true });
  }

  const baseName = path.parse(inputPath).name;
  const destination = path.join(batchDir, `${baseName}.${outputFormat}`);

  const info = await sharp(inputPath)
    .toFormat(outputFormat as keyof FormatEnum, {quality: 80})
    .toFile(destination)

  return { destination, size: info.size }
}, {
  connection: redis,
  concurrency: 3
});

imageWorker.on('completed', (job, returnvalue) => {
  console.log(`Job ${job.id} completed! Result:`, returnvalue);
});

imageWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});