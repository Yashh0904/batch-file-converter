import { app } from "./app.js";
import { ensureBucketExists } from "./lib/s3.js";
import './worker.js'

const port = process.env.PORT || 5000

await ensureBucketExists();

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
});