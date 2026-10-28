# Visual venue layout editor

## Context
Reusable venue geometry is separate from event-specific inventory. This is also
the model described by Seats.io: https://docs.seats.io/docs/tutorial/create-an-event/.
The initial coordinate form was cumbersome and reported layout mistakes only
after a request. The buyer map also contained hardcoded stage decorations.

## Decision
Keep the feature and replace the long form with a template library and a visual
section editor. Offer clearly labelled starter layouts, pointer and keyboard
positioning, bounded snapping, selected-object properties, undo/redo, and local
validation before a final review. The backend remains authoritative and inserts
all topology in one transaction. No new canvas library is needed; SVG supports
the bounded set of 20 sections.

Accept an optional rectangular stage in the creation API, retaining the previous
default when absent. Return the stored stage in the public seatmap and render it
on the buyer page. Existing templates and event inventories are not rewritten.

## Consequences
Saved templates remain immutable through the API. Price and standing capacity
belong to event tiers. Coordinates describe a schematic, not measured building
geometry. This version does not provide curved rows, arbitrary polygon editing,
per-seat accessibility editing, server draft persistence or edits of live maps.
Those require separate workflows and must not silently alter published seats.
