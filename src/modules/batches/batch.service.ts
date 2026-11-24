import { FlowProducer } from "bullmq";
import redis from "../../lib/redis.js";
import { nanoid } from "nanoid";
import { Batch } from "../../prisma/db.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, s3Bucket } from "../../lib/s3.js";

export const flowProducer = new FlowProducer({ connection: redis });

export const createBatchJob = async(files: Express.Multer.File[], outputFormat: string) => {
  let batchId = nanoid(10);
  while (await Batch.where({ id: batchId }).first()) {
    batchId = nanoid(10);
  }

  await Promise.all(
    files.map((file) =>
      s3.send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: `inputs/${batchId}/${file.originalname}`,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      )
    )
  );

  await flowProducer.add({
    name: 'finalize-batch',
    queueName: 'batch-summary',
    data: { batchId },
    opts: { 
      jobId: batchId,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 1000
      }
    },
    children: files.map(file => ({
      name: 'convert-image',
      queueName: 'image-processing',
      opts: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
      data: {
        batchId,
        inputKey: `inputs/${batchId}/${file.originalname}`,
        outputFormat: outputFormat
      }
    }))
  });

  return batchId;
}