import type { SeatReadSectionGeometry, SeatReadSectionSeats } from '../../api/generated';
export type Geometry = SeatReadSectionGeometry;
export function validStatus(geometry: Geometry, status: SeatReadSectionSeats) {
  return status.states.length === geometry.seats.length && /^[AHSB]+$/.test(status.states);
}
export function toggleSelection(selected: string[], id: string, limit: number, available: boolean) {
  if (selected.includes(id)) return selected.filter(value => value !== id);
  return available && selected.length < limit ? [...selected, id] : selected;
}
export function recoverSelection(selected: string[], taken: string[]) { return selected.filter(id => !taken.includes(id)); }
export function seatState(id: string, state: string, selected: string[], mine: string[]) {
  if (mine.includes(id) && state === 'H') return 'mine';
  if (state === 'B') return 'blocked';
  if (state !== 'A') return 'unavailable';
  return selected.includes(id) ? 'selected' : 'available';
}
export function remainingSeconds(expiresAt: string, now = Date.now()) { return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)); }
