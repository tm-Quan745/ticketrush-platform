# 0039: Cloudinary event image URLs

## Context
Events already persist and expose an optional imageUrl, but the admin UI does not accept it.

## Options
Accept an existing Cloudinary delivery URL, or implement signed uploads and asset lifecycle management.

## Decision
Reuse imageUrl and add optional URL inputs to event creation and the admin event detail page, with a preview. Accept only HTTPS shared-CDN URLs in the form https://res.cloudinary.com/<cloud>/image/upload/<asset>. Empty or null removes the image. Existing buyer components already render imageUrl.

Administrators upload images in Cloudinary first and paste the public delivery URL. No SDK, API key, environment variable, or database migration is needed. Authentication and ADMIN authorization remain enforced by existing event endpoints.

## Consequences
This is URL storage and delivery, not an in-app upload integration. Custom CDN domains and other delivery types are outside this scope. URL validation cannot guarantee the asset exists or remains public. Existing stored URLs are not migrated; new writes must use Cloudinary. Updates use the existing full event PUT contract, so concurrent admin edits have its existing last-write behavior.

Reference: https://cloudinary.com/documentation/image_transformations
