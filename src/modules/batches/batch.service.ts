import { FlowProducer } from "bullmq";
import redis from "../../lib/redis.js";
import { nanoid } from "nanoid";

export const flowProducer = new FlowProducer({ connection: redis });

export const createBatchJob = async(files: Express.Multer.File[], outputFormat: string) => {
  const batchId = nanoid(8);

  await flowProducer.add({
    name: 'finalize-batch',
    queueName: 'batch-summary',
    data: { batchId },
    opts: { jobId: batchId },
    children: files.map(file => ({
      name: 'convert-image',
      queueName: 'image-processing',
      data: {
        batchId,
        inputPath: file.path,
        outputFormat: outputFormat
      }
    }))
  })

  return batchId;
}