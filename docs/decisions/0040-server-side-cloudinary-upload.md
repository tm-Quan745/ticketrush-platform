# 0040: Server-side Cloudinary event image uploads

## Context
Administrators need to select local files instead of manually pasting a URL. This supersedes the URL-input workflow in ADR 0039; the existing imageUrl storage contract remains.

## Options
Use direct browser uploads with backend signatures, or proxy uploads through Spring.

## Decision
POST /api/v1/admin/events/images accepts a multipart file under the existing ADMIN security rule. Spring validates file size (5 MiB), decoded format (JPEG, PNG, GIF), and dimensions (20 million pixels maximum), then calls the Cloudinary image upload API using server-only Basic Authentication over HTTPS. Spring RestClient already exists in the stack; no new SDK is required.

CLOUDINARY_URL is read from the existing .env import or environment, and forwarded only to the backend by Docker Compose. Missing configuration disables uploads, not the rest of the app. Never expose it through VITE variables. Upstream errors are sanitized. Connection/read timeouts are 3/10 seconds.

The browser uploads on file selection, receives secure_url as imageUrl, and includes it in the existing event create/update request. Saving is disabled during upload. Upload errors preserve the previous image. The user can remove the image association.

## Consequences
Uploads consume backend bandwidth and bounded per-file memory. Upload and database save are separate operations: cancelling a form, replacing an image, a timeout after provider acceptance, or a failed event save may leave an unused Cloudinary asset. This scope does not delete assets automatically. Manual cleanup is possible in Cloudinary; an asset lifecycle job can be added separately. Tests stub the external provider and do not consume real Cloudinary quota.

## Setup and verification
Set CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@dxoarwolf in the root .env, then restart the local backend (or rebuild/recreate the backend service in Compose). Do not commit .env.
In an ADMIN session, create/edit an event, choose a PNG/JPEG/GIF, wait for the preview, and save the event. Reload to verify persistence. Try invalid and oversized files and verify the event retains its previous image.

Reference: https://cloudinary.com/documentation/upload_images
