import { FlowProducer } from "bullmq";
import redis from "../../lib/redis.js";
import { nanoid } from "nanoid";
import { Batch } from "../../prisma/db.js";

export const flowProducer = new FlowProducer({ connection: redis });

export const createBatchJob = async(files: Express.Multer.File[], outputFormat: string) => {
  let batchId = nanoid(10);
  while (await Batch.where({ id: batchId }).first()) {
    batchId = nanoid(10);
  }

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
        inputPath: file.path,
        outputFormat: outputFormat
      }
    }))
  })

  return batchId;
}