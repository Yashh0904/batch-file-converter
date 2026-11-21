import { readdirSync } from "node:fs";
import path from "node:path";
import { FlowProducer } from "bullmq";
import redis from "./lib/redis.js";

const flowProducer = new FlowProducer({ connection: redis })

const inputDir = path.resolve('./inputs')
const files = readdirSync(inputDir);

await flowProducer.add({
  name: 'finalize-batch',
  queueName: 'batch-summary',
  data: { batchId: 'batch_001' },
  children: files.map(file => ({
    name: 'convert-image',
    queueName: 'image-processing',
    data: {
      inputPath: path.join(inputDir, file),
      outputFormat: 'webp'
    }
  }))
}) 

process.exit(0)