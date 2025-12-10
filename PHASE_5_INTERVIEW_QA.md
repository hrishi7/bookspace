# Phase 5 Interview Q&A - File Upload & Processing

Production-ready answers for file upload, AWS S3, streaming, and image processing interviews.

---

## Q1: "How do you handle file uploads in Node.js? What's the difference between streaming and buffering?"

**Answer:**

There are two approaches:

**1. Buffering (Bad for large files):**
```typescript
// Load entire file into memory
app.post('/upload', (req, res) => {
  const fileBuffer = req.body.file; // 100MB file = 100MB RAM!
  // Memory usage = file size
  // Problem: Large files→ crash server
});
```

**2. Streaming (Memory efficient - our choice):**
```typescript
// Process chunk-by-chunk
app.post('/upload', upload.single('file'), (req, res) => {
  // multer-s3 streams directly to S3
  // 10GB file uses ~10MB RAM (constant)
  // Memory usage = fixed chunk size
});
```

**Why Streaming?**
- **Constant memory**: Regardless of file size
- **Handle huge files**: 10GB+ no problem
- **Faster processing**: Start uploading before download completes
- **Scalable**: Won't OOM (out of memory)

**Our Implementation:**
We use `multer` + `multer-s3` which streams file chunks directly from client→Server→S3 without storing the entire file in memory.

---

## Q2: "What is AWS S3 and why use it for file storage?"

**Answer:**

**S3 = Simple Storage Service** - Object storage by AWS

**Why S3 over local filesystem?**

| Aspect | Local Filesystem | AWS S3 |
|--------|-----------------|--------|
| **Scalability** | Limited by disk | Infinite |
| **Durability** | Single point of failure | 99.999999999% (11 nines) |
| **Availability** | Server crash = downtime | 99.99% uptime |
| **Cost** | Fixed (buy disks) | Pay per GB used |
| **CDN** | Need separate setup | CloudFront integration |
| **Backups** | Manual | Automatic versioning |

**S3 Key Concepts:**
- **Bucket**: Container for objects (like a folder)
- **Object**: File + metadata
- **Key**: File path (`uploads/user123/file.jpg`)
- **Region**: Geographic location (latency optimization)

**Access Control:**
- **Private bucket** (our choice): Signed URLs for temporary access
- **Public bucket**: Anyone can download (risky!)

**Interview Tip:** Always mention **private buckets + signed URLs** for security!

---

## Q3: "What are signed URLs and why use them?"

**Answer:**

**Signed URL** = Temporary access grant to private S3 object

**Flow:**
```
1. Client requests file download
2. Server generates signed URL (valid for 1 hour)
3. Client downloads directly from S3 using signed URL
4. URL expires after 1 hour
```

**Benefits:**
- **Security**: Bucket stays private
- **Scalability**: Server doesn't proxy file (saves bandwidth)
- **Speed**: Direct download from S3 (faster)
- **Time-limited**: URL expires (can't share forever)

**Our Implementation:**
```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const command = new GetObjectCommand({
  Bucket: 'bookspace-uploads',
  Key: 'uploads/user123/file.jpg',
});

const url = await getSignedUrl(s3Client, command, {
  expiresIn: 3600, // 1 hour
});
```

**Alternative (Bad):**
```typescript
// Server proxies file (wastes bandwidth)
app.get('/download/:id', async (req, res) => {
  const file = await s3.getObject(...);
  file.pipe(res); // Server handles transfer
});
```

**Interview Tip:** Emphasize **server doesn't handle file transfer** - S3 does!

---

## Q4: "How do you validate file uploads? What security concerns exist?"

**Answer:**

**Security Threats:**
1. **Malicious files**: Executable disguised as image
2. **DoS attacks**: Upload 10GB file → crash server
3. **Storage bombs**: Million tiny files → fill disk
4. **Wrong MIME**: Claim image but actually video

**Our Validation Strategy:**

**1. File Size Limit:**
```typescript
multer({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});
```

**2. MIME Type Validation:**
```typescript
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];

fileFilter: (req, file, cb) => {
  if (!ALLOWED.includes(file.mimetype)) {
    return cb(new Error('File type not allowed'));
  }
  cb(null, true);
}
```

**3. Extension Check:**
```typescript
const ext = filename.split('.').pop();
if (!['jpg', 'png', 'pdf'].includes(ext)) {
  throw new Error('Invalid extension');
}
```

**4. Content Inspection (Advanced):**
```typescript
// Check file signature (magic bytes)
const signature = buffer.slice(0, 4).toString('hex');
// JPG: ffd8ffe0, PNG: 89504e47
```

**What We DON'T Do (yet):**
- **Virus scanning**: Use ClamAV in production
- **Content moderation**: ML models to detect inappropriate content
- **Rate limiting**: Prevent user uploading 1000 files/sec

**Interview Tip:** Mention **never trust client** - validate server-side!

---

## Q5: "Explain multipart uploads and when to use them"

**Answer:**

**Multipart Upload** = Split large file into chunks, upload in parallel

**How it works:**
```
1. Initiate multipart upload → Get upload ID
2. Split file into parts (5MB-5GB each)
3. Upload parts in parallel
4. Complete upload → S3 assembles parts
```

**Benefits:**
- **Resume capability**: Failed part? Re-upload just that part
- **Faster**: Upload parts in parallel
- **Large files**: Handle files >5GB
- **Network resilience**: Retry individual parts

**When to use:**
- Files >100MB: Significant speed improvement
- Unstable network: Resume capability crucial
- Very large files (>5GB): S3 requires multipart

**Our Implementation (using multer-s3):**
Multer-s3 handles this automatically for files >5MB!

**Alternative - Manual:**
```typescript
// 1. Initiate
const upload = await s3.createMultipartUpload({
  Bucket: 'bucket',
  Key: 'large-file.mp4',
});

// 2. Upload parts
const parts = [];
for (let i = 0; i < totalParts; i++) {
  const part = await s3.uploadPart({
    UploadId: upload.UploadId,
    PartNumber: i + 1,
    Body: chunk,
  });
  parts.push({ PartNumber: i + 1, ETag: part.ETag });
}

// 3. Complete
await s3.completeMultipartUpload({
  UploadId: upload.UploadId,
  MultipartUpload: { Parts: parts },
});
```

**Interview Tip:** Mention **parallel uploads** and **resume capability**!

---

## Q6: "How do you generate thumbnails for images? Sharp vs ImageMagick?"

**Answer:**

**Sharp** (our choice) vs **ImageMagick**:

| Aspect | Sharp | ImageMagick |
|--------|-------|-------------|
| **Speed** | 4-5x faster | Slower |
| **Memory** | Low | High |
| **Installation** | `npm install sharp` | System dependency |
| **API** | JavaScript | CLI/bindings |
| **Best for** | Node.js | Any language |

**Our Implementation:**
```typescript
import sharp from 'sharp';

const thumbnail = await sharp(imageBuffer)
  .resize(300, 300, {
    fit: 'cover', // Crop to fill
    position: 'center',
  })
  .jpeg({
    quality: 80,
    progressive: true, // Progressive JPEG (better for web)
  })
  .toBuffer();

// Upload to S3
await s3.send(new PutObjectCommand({
  Key: 'thumbnails/file.jpg',
  Body: thumbnail,
}));
```

**Key Operations:**
- **Resize**: Change dimensions
- **Crop**: `fit: 'cover'` (fill) vs `fit: 'contain'` (letterbox)
- **Format conversion**: PNG→JPEG
- **Compression**: `quality: 80` (balance size/quality)
- **Progressive**: Load incrementally (better UX)

**Why Background Processing?**
```
Upload 10MB image (2 seconds)
→ Don't wait for thumbnail (5 seconds)
→ Return immediately
→ Worker generates thumbnail async
```

**Event-Driven Flow:**
```
1. Upload Service: Upload complete → Publish "file.uploaded" event
2. RabbitMQ: Route event to worker
3. Worker: Download, resize, upload thumbnail
```

**Interview Tip:** Mention **Sharp is faster** and **async processing doesn't block users**!

---

## Q7: "What's the difference between multipart/form-data and JSON for file uploads?"

**Answer:**

**multipart/form-data** (for files - our choice):
```http
POST /upload HTTP/1.1
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="image.jpg"
Content-Type: image/jpeg

[binary data]
------WebKitFormBoundary
Content-Disposition: form-data; name="userId"

user123
------WebKitFormBoundary--
```

**Benefits:**
- Binary data support
- Multiple files + metadata
- No encoding overhead
- Standard for file uploads

**JSON with Base64** (bad for files):
```json
{
  "file": "iVBORw0KGgoAAAANS..." // Base64 encoded
}
```

**Problems:**
- **33% size increase**: Base64 encoding overhead
- **CPU intensive**: Encode/decode
- **Memory**: Load entire file
- **Not standard**: Reinventing wheel

**When to use each:**
- **multipart/form-data**: File uploads, form submissions
- **JSON**: API data, no binary content

**Interview Tip:** Always use **multipart/form-data for files**!

---

## Q8: "How do you implement event-driven thumbnail generation?"

**Answer:**

**Architecture:**
```
Upload Service                    Worker Service
     |                                 |
   Upload ────────────────────\        |
     |                         ↓       |
  Publish────────────RabbitMQ────> Subscribe
 "file.uploaded"                   Generate
     |                             Thumbnail
  Return                              ↓
   200                          Upload to S3
```

**Benefits:**
- **Non-blocking**: User doesn't wait
- **Scalable**: Add more workers
- **Reliable**: Retry on failure
- **Decoupled**: Services independent

**Implementation:**

**1. Upload Service publishes event:**
```typescript
await broker.publish({
  type: 'file.uploaded',
  data: {
    fileId: '123',
    s3Key: 'uploads/user/file.jpg',
    isImage: true,
  },
});
```

**2. Worker subscribes:**
```typescript
await broker.subscribe('bookspace.files', async (event) => {
 if (event.type === 'file.uploaded' && event.data.isImage) {
    await generateThumbnail(event.data);
  }
});
```

**3. Worker processes:**
```typescript
async function generateThumbnail(data) {
  // Download from S3
  const image = await s3.getObject({ Key: data.s3Key });
  
  // Resize with Sharp
  const thumbnail = await sharp(image.Body)
    .resize(300, 300)
    .jpeg({ quality: 80 })
    .toBuffer();
  
  // Upload thumbnail
  await s3.putObject({
    Key: `thumbnails/${data.fileId}.jpg`,
    Body: thumbnail,
  });
}
```

**Interview Tip:** Emphasize **async processing** and **event-driven architecture**!

---

## Topics Covered

✅ Streaming vs Buffering (memory efficiency)
✅ AWS S3 (object storage benefits)
✅ Signed URLs (secure temporary access)
✅ File Validation (security best practices)
✅ Multipart Uploads (large file handling)
✅ Sharp (image processing)
✅ multipart/form-data (file upload standard)
✅ Event-Driven Thumbnails (async processing)

**All Phase 5 concepts ready for senior-level interviews!** 🚀
