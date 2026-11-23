import express from 'express'
import batchRouter from './modules/batches/batch.route.js';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { imageQueue, batchQueue } from './utils/queue.js';

export const app = express();

app.use(express.json());

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [
    new BullMQAdapter(imageQueue),
    new BullMQAdapter(batchQueue),
  ],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

app.use('/api/batches', batchRouter);