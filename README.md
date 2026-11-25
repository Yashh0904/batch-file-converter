# Batch Media Converter

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express 5](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-E3342F?style=for-the-badge)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma 8](https://img.shields.io/badge/Prisma_8-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![S3 / SeaweedFS](https://img.shields.io/badge/S3_%2F_SeaweedFS-569A31?style=for-the-badge&logo=amazons3&logoColor=white)
![Sharp](https://img.shields.io/badge/Sharp-99CC00?style=for-the-badge&logo=sharp&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

An asynchronous batch image processing service built with Express, BullMQ, Redis, PostgreSQL (Prisma 8), and S3-compatible object storage (SeaweedFS).

Clients upload a batch of images, receive a `batchId` immediately, track conversion progress live via Server-Sent Events (SSE), and download converted outputs individually or as a streamed ZIP archive.

## Architecture

1. **Ingestion (`Express` + `Multer`):** Validates uploads in memory and stores raw files in S3 (`inputs/<batchId>/...`), then creates a `Batch` record in PostgreSQL.
2. **Queue Orchestration (`BullMQ FlowProducer` + `Redis`):** Creates a parent-child job tree (`finalize-batch` waiting on N `convert-image` child jobs) with exponential backoff retries and bounded job retention.
3. **Image Processing (`Worker` + `Sharp`):** Pulls raw bytes from S3 into memory (concurrency: 4), converts to the target format (`webp`, `avif`, `jpeg`, `png`), uploads outputs back to S3 (`outputs/<batchId>/...`), and records `Asset` metadata in PostgreSQL.
4. **Live Progress (`SSE` + `Redis Pub/Sub`):** Workers publish per-file completion events to `batch:<id>:events`, which Express streams to the client over HTTP.
5. **Delivery (`Archiver`):** Fetches converted buffers from S3 in parallel and streams a ZIP archive directly in the HTTP response without writing temporary files to disk.

## Tech Stack

- **Runtime & API:** Node.js, TypeScript, Express 5, Multer
- **Queues & Pub/Sub:** BullMQ, Redis (ioredis), Bull-Board
- **Image Processing & Archiving:** Sharp, Archiver
- **Database:** PostgreSQL, Prisma 8 (`@prisma/orm-postgres`)
- **Object Storage:** AWS S3 SDK (`@aws-sdk/client-s3`), SeaweedFS
- **Infrastructure:** Docker, Docker Compose

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/batches` | Upload up to 10 images (`files`) and `outputFormat` (`webp`, `avif`, `jpeg`, `png`) |
| `POST` | `/api/batches/image/resize` | Synchronously resize a single image (`file`) using `width` and/or `height` |
| `GET` | `/api/batches/:id` | Get batch status and converted asset metadata from PostgreSQL |
| `GET` | `/api/batches/:id/events` | Stream real-time batch progress via Server-Sent Events (SSE) |
| `GET` | `/api/batches/:id/download` | Download all converted assets as a streamed ZIP archive |
| `GET` | `/api/batches/:id/files/:filename` | Download a single converted asset |
| `GET` | `/admin/queues` | Bull-Board queue monitoring UI |

## Running Locally

1. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in your Postgres and S3 settings.

2. **Start dependencies (Redis, PostgreSQL, SeaweedFS):**
   ```bash
   docker compose up -d redis postgres seaweedfs
   ```

3. **Install dependencies & push database schema:**
   ```bash
   npm install
   npx prisma db update
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```