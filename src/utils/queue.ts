import { Queue } from "bullmq";
import redis from "../lib/redis.js";

export interface ImageJobData {
  batchId: string,
  inputKey: string,
  outputFormat: string,
  width?: number,
  height?: number
}

export const imageQueue = new Queue<ImageJobData>("image-processing" , {
  connection: redis,
});

export const batchQueue = new Queue('batch-summary', { connection: redis });