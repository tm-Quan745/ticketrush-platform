import type { SeatReadSectionGeometry, SeatReadSectionSeats } from '../../api/generated';
export type Geometry = SeatReadSectionGeometry;
export function sortedSeats<T extends { rowLabel: string; number: number }>(seats: T[]): T[] {
  return [...seats].sort((a, b) => a.rowLabel.localeCompare(b.rowLabel, 'en', { numeric: true }) || a.number - b.number);
}
export function aisleBefore(seats: Geometry['seats'], index: number): boolean {
  return index > 0 && seats[index].rowLabel === seats[index - 1].rowLabel && seats[index].adjacencySegment !== seats[index - 1].adjacencySegment;
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

export function suggestAdjacentSeats(geometry: Geometry, states: string, quantity: number, accessible: boolean): string[] {
  const seats = geometry.seats;
  if (!seats || quantity < 1 || quantity > seats.length) return [];
  const runs: { seats: typeof seats; score: number }[] = [];
  for (let i = 0; i + quantity <= seats.length; i++) {
    const run = seats.slice(i, i + quantity);
    const first = run[0];
    let valid = true;
    for (let j = 0; j < run.length; j++) {
      const idx = i + j;
      const s = run[j];
      const state = states[idx];
      if (
        state !== 'A' ||
        s.rowLabel !== first.rowLabel ||
        s.adjacencySegment !== first.adjacencySegment ||
        s.number !== first.number + j ||
        (!accessible && s.accessible)
      ) {
        valid = false;
        break;
      }
    }
    if (valid && (!accessible || run.some(s => s.accessible))) {
      const rowSeats = seats.filter(s => s.rowLabel === first.rowLabel);
      const minNum = Math.min(...rowSeats.map(s => s.number));
      const maxNum = Math.max(...rowSeats.map(s => s.number));
      const centerDist = Math.abs((run[0].number + run[run.length - 1].number) / 2.0 - (minNum + maxNum) / 2.0);
      const accessibleBonus = accessible ? -run.filter(s => s.accessible).length * 10000 : 0;
      const score = accessibleBonus + (run[0].y ?? 0) * 1000 + centerDist * 10 + run[0].number;
      runs.push({ seats: run, score });
    }
  }
  if (!runs.length) return [];
  runs.sort((a, b) => a.score - b.score);
  return runs[0].seats.map(s => s.id);
}
