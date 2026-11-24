import express from "express"
import { createBatch, downloadBatch, downloadFile, getBatchStatus, streamBatchEvents } from "./batch.controller.js";
import multer from "multer";
import { errorHandler } from "../../middleware/error.middleware.js";

const upload = multer({ storage: multer.memoryStorage() })

const batchRouter = express.Router();

batchRouter.post('/', upload.array('files', 10), createBatch, errorHandler);

batchRouter.get('/:id', getBatchStatus, errorHandler);

batchRouter.get('/:id/events', streamBatchEvents, errorHandler);

batchRouter.get('/:id/download', downloadBatch, errorHandler);

batchRouter.get('/:id/files/:filename', downloadFile, errorHandler);

export default batchRouter;