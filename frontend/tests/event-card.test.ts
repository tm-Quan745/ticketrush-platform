import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventCard } from '../src/components/EventCard';

test('event card exposes the full panel as a keyboard-accessible detail button', () => {
  const html = renderToStaticMarkup(React.createElement(EventCard, {
    event: {
      id: 'event-1', title: 'Tình Hà Say Hi', description: 'Demo', venueName: 'Venue', venueAddress: 'Address', imageUrl: null,
      startTime: '2026-12-19T12:30:00Z', endTime: '2026-12-19T15:30:00Z', saleStartTime: '2026-10-01T02:00:00Z', saleEndTime: '2026-12-19T11:00:00Z',
      status: 'PUBLISHED', waitingRoomEnabled: false,
    },
    onSelect: () => {}, onJoinQueue: () => {},
  }));
  assert.match(html, /<article[^>]*relative/);
  assert.match(html, /<button[^>]*aria-label="Xem sự kiện Tình Hà Say Hi"[^>]*type="button"/);
  assert.match(html, /<button[^>]*>.*Xem sự kiện/s);
});
