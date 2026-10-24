import type { SeatReadSectionGeometry, SeatReadSectionSeats } from '../../api/generated';
export type Geometry = SeatReadSectionGeometry;
export function sortedSeats<T extends {rowLabel: string; number: number}>(seats: T[]): T[] {
  return [...seats].sort((a,b)=>a.rowLabel.localeCompare(b.rowLabel, 'en', {numeric:true}) || a.number-b.number);
}
export function aisleBefore(seats: Geometry['seats'], index: number): boolean {
  return index > 0 && seats[index].rowLabel === seats[index-1].rowLabel && seats[index].adjacencySegment !== seats[index-1].adjacencySegment;
}
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
