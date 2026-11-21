import express from "express"
import { createBatch, getBatchStatus } from "./batch.controller.js";
import multer from "multer";
import { errorHandler } from "../../middleware/error.middleware.js";

const upload = multer({ dest: './inputs' })

const batchRouter = express.Router();

batchRouter.post('/', upload.array('files', 10), createBatch, errorHandler);

batchRouter.get('/:id', getBatchStatus, errorHandler);

export default batchRouter;