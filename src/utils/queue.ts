import { Queue } from "bullmq";
import redis from "../lib/redis.js";

export interface ImageJobData {
  inputPath: string,
  outputFormat: string,
  width?: number,
  height?: number
}

export const imageQueue = new Queue<ImageJobData>("image-processing" , {
  connection: redis,
});