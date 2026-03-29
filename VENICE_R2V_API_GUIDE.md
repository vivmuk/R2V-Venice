# Venice AI - Grok Imagine Reference-to-Video (R2V) API Guide

> **Last verified:** March 2026
> **Important:** The official docs at https://docs.venice.ai/overview/guides/reference-to-video are **out of sync** with the production API. This guide documents what actually works based on live testing.

---

## Overview

Grok Imagine R2V lets you generate videos from 1-7 reference images. You upload images, reference them in your prompt as `@Image1`, `@Image2`, etc., and the API generates a video featuring those references.

---

## API Endpoints

| Endpoint | URL | Method |
|----------|-----|--------|
| Queue (generate) | `https://api.venice.ai/api/v1/video/queue` | POST |
| Retrieve (poll) | `https://api.venice.ai/api/v1/video/retrieve` | POST |
| Quote (estimate) | `https://api.venice.ai/api/v1/video/quote` | POST |

All endpoints require:
```
Authorization: Bearer YOUR_VENICE_API_KEY
Content-Type: application/json
```

---

## Docs vs Production: Critical Differences

The official Venice docs say one thing, but the production API validates differently. **Always follow the "Production (actual)" column.**

| Field | Docs say | Production (actual) |
|-------|----------|---------------------|
| Reference images | `referenceImageUrls` (camelCase) | **Rejected.** Use `reference_image_urls` (snake_case) |
| First image | Not mentioned | `image_url` is **required** (validator enforces this) |
| Duration format | `"5"`, `"8"`, `"10"` | `"5s"`, `"8s"`, `"10s"` (with 's' suffix) |
| Queue response ID | `id` | `queue_id` (with `id` as fallback) |

---

## Step 1: Upload Images to a Public Host

The API needs publicly accessible image URLs. Local files and base64 data URIs don't work reliably. Use a service like ImgBB.

### ImgBB Upload

```
POST https://api.imgbb.com/1/upload?key=YOUR_IMGBB_KEY
Content-Type: multipart/form-data

Body (FormData):
  image: <file binary>
```

**Response:**
```json
{
  "data": {
    "url": "https://i.ibb.co/xxxxx/image.jpg",
    "display_url": "https://i.ibb.co/xxxxx/image.jpg"
  },
  "success": true,
  "status": 200
}
```

Use `data.data.url` as your image URL.

### JavaScript Implementation

```javascript
const IMGBB_API_KEY = 'your_key_here';

async function uploadToImageHost(file) {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

    const data = await res.json();
    if (data.success && data.data && data.data.url) {
        return data.data.url;
    }
    throw new Error('Invalid response from ImgBB');
}
```

---

## Step 2: Queue a Video Generation

### Working Queue Payload

```json
{
  "model": "grok-imagine-reference-to-video",
  "duration": "5s",
  "aspect_ratio": "16:9",
  "resolution": "480p",
  "prompt": "@Image1 giving a speech while @Image2 watches from the crowd",
  "image_url": "https://i.ibb.co/xxxxx/first-image.jpg",
  "reference_image_urls": [
    "https://i.ibb.co/xxxxx/first-image.jpg",
    "https://i.ibb.co/xxxxx/second-image.jpg"
  ]
}
```

### Field Reference

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `model` | string | Yes | `"grok-imagine-reference-to-video"` |
| `prompt` | string | Yes | Text with `@Image1`, `@Image2`, etc. Max 5000 chars |
| `image_url` | string | Yes | URL of the first reference image |
| `reference_image_urls` | string[] | Yes | Array of 1-7 image URLs (includes the first image) |
| `duration` | string | Yes | `"5s"`, `"8s"`, or `"10s"` |
| `aspect_ratio` | string | No | `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"3:2"`, `"2:3"`, `"3:4"` |
| `resolution` | string | No | `"480p"` (default) or `"720p"` |

### Why Both `image_url` AND `reference_image_urls`?

The production API has two validation layers:
1. **Generic validator** - Checks all image-to-video models. Requires `image_url`.
2. **R2V generation engine** - Processes the actual video. Requires `reference_image_urls`.

If you omit `image_url`, the queue returns: `"image_url is required for image to video models"`
If you omit `reference_image_urls`, the queue accepts but the retrieve returns: `"reference_image_urls: Field required"`

You must send **both**.

### Prompt Tags

- `@Image1` = first image in the `reference_image_urls` array
- `@Image2` = second image
- Up to `@Image7`
- Tags are **case-sensitive** (capital I in Image)
- Tags map to array index order

### JavaScript Implementation

```javascript
const API_QUEUE_URL = "https://api.venice.ai/api/v1/video/queue";

async function queueVideo(apiKey, prompt, imageUrls, options = {}) {
    const payload = {
        model: "grok-imagine-reference-to-video",
        prompt: prompt,
        duration: options.duration || "5s",
        aspect_ratio: options.aspect_ratio || "16:9",
        resolution: options.resolution || "480p",
        image_url: imageUrls[0],
        reference_image_urls: imageUrls
    };

    const res = await fetch(API_QUEUE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Queue failed: ${res.status} - ${errBody}`);
    }

    const data = await res.json();
    return {
        queueId: data.id || data.queue_id,
        model: data.model || payload.model
    };
}
```

### Queue Response

```json
{
  "queue_id": "019d39c4-97d7-76b0-bc56-5ca8467cced1",
  "model": "grok-imagine-reference-to-video"
}
```

---

## Step 3: Poll for the Result

### Retrieve Payload

The retrieve endpoint only needs `model` and `queue_id`. Do NOT include `reference_image_urls`, `image_url`, or `delete_media_on_completion` - these are rejected as unrecognized keys.

```json
{
  "model": "grok-imagine-reference-to-video",
  "queue_id": "019d39c4-97d7-76b0-bc56-5ca8467cced1"
}
```

### Response Types

The retrieve endpoint returns different content types depending on status:

**Still processing** - Returns JSON:
```json
{
  "status": "PROCESSING",
  "execution_duration": 12345,
  "average_execution_time": 60000
}
```

**Completed** - Returns the video binary directly:
```
Content-Type: video/mp4
Body: <raw video bytes>
```

**Failed** - Returns JSON:
```json
{
  "status": "failed",
  "error": "description of what went wrong"
}
```

**Not found** - Returns HTTP 404 (job still queuing, keep polling).

### JavaScript Implementation

```javascript
const API_POLL_URL = "https://api.venice.ai/api/v1/video/retrieve";

async function pollVideoResult(queueId, model, apiKey) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 120; // 10 minutes at 5s intervals

        const poll = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(poll);
                reject(new Error('Polling timeout after 10 minutes'));
                return;
            }

            try {
                const res = await fetch(API_POLL_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({ model, queue_id: queueId })
                });

                // 404 = not ready yet, keep polling
                if (res.status === 404) return;

                if (!res.ok) {
                    const errBody = await res.text();
                    clearInterval(poll);
                    reject(new Error(`Poll error ${res.status}: ${errBody}`));
                    return;
                }

                const contentType = res.headers.get("Content-Type") || "";

                if (contentType.includes("video/mp4")) {
                    // Video is ready - returned as binary blob
                    clearInterval(poll);
                    const blob = await res.blob();
                    const videoUrl = URL.createObjectURL(blob);
                    resolve({ status: 'completed', videoUrl, blob });
                } else {
                    // JSON status response
                    const data = await res.json();
                    if (data.status === 'failed' || data.status === 'error') {
                        clearInterval(poll);
                        reject(new Error(data.error || 'Video generation failed'));
                    }
                    // Otherwise still processing, keep polling
                }
            } catch(e) {
                // Terminal errors - stop polling
                if (e.message.includes('400') || e.message.includes('401') || e.message.includes('422')) {
                    clearInterval(poll);
                    reject(e);
                }
                // Transient errors - keep polling
            }
        }, 5000); // Poll every 5 seconds
    });
}
```

---

## Complete End-to-End Example

```javascript
async function generateVideo(apiKey, imageFiles, prompt) {
    // 1. Upload images to ImgBB
    const imageUrls = [];
    for (const file of imageFiles) {
        const url = await uploadToImageHost(file);
        imageUrls.push(url);
        console.log(`Uploaded: ${url}`);
    }

    // 2. Queue the video
    const { queueId, model } = await queueVideo(apiKey, prompt, imageUrls, {
        duration: "5s",
        aspect_ratio: "16:9",
        resolution: "480p"
    });
    console.log(`Queued: ${queueId}`);

    // 3. Poll for result
    const result = await pollVideoResult(queueId, model, apiKey);
    console.log(`Video ready: ${result.videoUrl}`);

    // 4. Display in a <video> element
    const video = document.createElement('video');
    video.src = result.videoUrl;
    video.controls = true;
    video.autoplay = true;
    document.body.appendChild(video);
}
```

---

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `"image_url is required for image to video models"` | Missing `image_url` in queue payload | Add `image_url` set to the first image URL |
| `"reference_image_urls: Field required"` | Missing `reference_image_urls` in queue payload | Add `reference_image_urls` array with all image URLs |
| `"Unrecognized key(s) in object: 'referenceImageUrls'"` | Used camelCase field name | Use `reference_image_urls` (snake_case) in queue |
| `"Unrecognized key(s) in object: 'reference_image_urls'"` on retrieve | Included image URLs in retrieve body | Retrieve only needs `{ model, queue_id }` |
| `"Invalid enum value. Expected '5s' \| '8s' \| '10s', received '5'"` | Duration missing 's' suffix | Use `"5s"`, `"8s"`, or `"10s"` |
| `"Invalid reference index 2 for image. Only 1 image(s) provided"` | Prompt uses `@Image2` but only 1 image in array | Ensure `reference_image_urls` contains all referenced images |
| HTTP 401 | Invalid or expired API key | Check your Venice API key |
| HTTP 429 | Rate limited | Wait and retry |

---

## Available Models

| Model ID | Type |
|----------|------|
| `grok-imagine-reference-to-video` | Grok Imagine R2V (1-7 reference images) |
| `kling-o3-pro-reference-to-video` | Kling O3 Pro R2V (uses elements/scenes) |
| `kling-o3-standard-reference-to-video` | Kling O3 Standard R2V (uses elements/scenes) |

---

## Key Rules Summary

1. **Images must be publicly accessible URLs** - Use ImgBB or similar hosting. Base64 data URIs are unreliable.
2. **Send both `image_url` AND `reference_image_urls`** in the queue payload. Both are required.
3. **Duration needs the 's' suffix** - `"5s"`, `"8s"`, `"10s"`. Not `"5"`, `"8"`, `"10"`.
4. **Use snake_case** - `reference_image_urls`, NOT `referenceImageUrls`.
5. **Retrieve is minimal** - Only send `{ model, queue_id }`. No image fields.
6. **Retrieve returns binary video** - Check `Content-Type: video/mp4`, then read as blob.
7. **Prompt tags are case-sensitive** - `@Image1` (capital I), maps to array order.
8. **Poll every 5 seconds** - Video generation takes 1-5+ minutes.
9. **404 on retrieve means "not ready"** - Keep polling.
10. **The docs lie** - Trust this guide over the official docs for field names and formats.
