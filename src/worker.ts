import { Job, Worker } from "bullmq";
import type { ImageJobData } from "./utils/queue.js";
import redis from "./lib/redis.js";
import sharp, { type FormatEnum } from "sharp";
import path from "node:path";
import { Asset, Batch } from "./prisma/db.js";
import { s3, s3Bucket } from "./lib/s3.js";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const batchWorker = new Worker('batch-summary', async (job) => {
  console.log(`\nAll children finished! Finalizing batch: ${job.data.batchId}`);

  await Batch.where({ id: job.data.batchId }).update({
    status: "COMPLETED"
  });
  
  const childrenValues = await job.getChildrenValues();
  console.log('Results from all images:', childrenValues);

  await redis.publish(`batch:${job.data.batchId}:events`,
    JSON.stringify({
      type: 'completed',
      batchId: job.data.batchId,
    })
  );

  return {
    batchId: job.data.batchId,
    totalFiles: Object.keys(childrenValues).length,
    files: childrenValues,
  };
}, {
  connection: redis
})

const imageWorker = new Worker('image-processing', async (job: Job<ImageJobData>) => {
  const {batchId, inputKey, outputFormat} = job.data;

  console.log(`Processing file: ${inputKey} to format: ${outputFormat}`);

  const s3Response = await s3.send(
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: inputKey
    })
  );

  const inputBuffer = Buffer.from(await s3Response.Body!.transformToByteArray());

  const outputBuffer = await sharp(inputBuffer)
    .toFormat(outputFormat as keyof FormatEnum, { quality: 80 })
    .toBuffer();

  const baseName = path.parse(inputKey).name;
  const outputKey = `outputs/${batchId}/${baseName}.${outputFormat}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: outputKey,
      Body: outputBuffer,
      ContentType: `image/${outputFormat}`,
    })
  );

  await Asset.create({
    batchId,
    originalPath: inputKey,
    outputPath: outputKey,
    fileSize: outputBuffer.length,
    format: outputFormat
  });

  await redis.publish(`batch:${batchId}:events`,
    JSON.stringify({
      type: "progress",
      file: baseName,
      format: outputFormat
    })
  );

  return { outputKey, size: outputBuffer.length }
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