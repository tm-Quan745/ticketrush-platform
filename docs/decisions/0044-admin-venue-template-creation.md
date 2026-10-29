# Admin venue template creation

## Context
Administrators need reusable stadium layouts beyond the bundled template.

## Decision
Expose POST /api/v1/admin/venues for ADMIN only and an admin venue editor.
Create version 1 under a unique template key. Use rectangular sections, a fixed
stage centered at the top, and server-generated seat coordinates and row labels.
Validate bounds, overlap, unique section codes and a 20,000-seat limit before
inserting the venue, sections and seats in one transaction. Standing sections
have no physical seats; their capacity belongs to each event tier. A configurable
aisle interval determines adjacency segments. No accessible seats are inferred.

## Alternatives and consequences
A free-form polygon editor provides more flexibility but substantially increases
validation and editing complexity. Rectangles reuse the existing polygon format
and buyer seat picker. Existing templates remain immutable through this API;
administrators create a new key for another layout. No schema migration is needed.
