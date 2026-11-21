import { Queue } from "bullmq";
import redis from "./lib/redis.js";

export const batchQueue = new Queue('batch-summary', { connection: redis });