import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

export const s3Bucket = process.env.S3_BUCKET_NAME || "batch-media";

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || "http://localhost:8333",
  region: process.env.S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "admin",
    secretAccessKey: process.env.S3_SECRET_KEY || "secret",
  },
  forcePathStyle: true,
});

export const ensureBucketExists = async () => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: s3Bucket }));
  } catch {
    console.log(`Bucket "${s3Bucket}" not found. Creating it now...`);
    await s3.send(new CreateBucketCommand({ Bucket: s3Bucket }));
    console.log(`Bucket "${s3Bucket}" created successfully!`);
  }
};