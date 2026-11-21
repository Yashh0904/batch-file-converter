import express from 'express'
import multer from 'multer';
import batchRouter from './modules/batches/batch.route.js';

export const app = express();

app.use(express.json());

app.use('/api/batches', batchRouter);