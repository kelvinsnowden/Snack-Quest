import { describe, expect, it } from 'vitest';
import { googleMapsLinks, isUsablePosition, planRoute, roadKm, type RouteStop } from '@/lib/vending/routePlanner';

const stop = (id: string, latitude: number, longitude: number): RouteStop => ({ id, label: id, latitude, longitude });
// Four points along a line, given out of order.
const line = [stop('C', -1.3, 36.9), stop('A', -1.3, 36.7), stop('D', -1.3, 37.0), stop('B', -1.3, 36.8)];

describe('route planner', () => {
  it('visits machines along a line in order, not as given', () => {
    const route = planRoute(line);
    const ids = route.stops.map((s) => s.id).join('');
    expect(['ABCD', 'DCBA']).toContain(ids);
  });

  it('starts nearest the rider when a start is given', () => {
    const route = planRoute(line, { latitude: -1.3, longitude: 37.05 });
    expect(route.stops.map((s) => s.id)).toEqual(['D', 'C', 'B', 'A']);
    expect(route.legKm[0]).toBeCloseTo(roadKm({ latitude: -1.3, longitude: 37.05 }, line[2]), 6);
    expect(route.totalKm).toBeCloseTo(route.legKm.reduce((a, b) => a + b, 0), 6);
  });

  it('beats the given order on a scattered fleet and never loses a machine', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const fleet = Array.from({ length: 40 }, (_, i) => stop(`m${i}`, -1.2 - random() * 0.3, 36.7 + random() * 0.4));
    const route = planRoute(fleet);
    expect(new Set(route.stops.map((s) => s.id)).size).toBe(40);
    let given = 0;
    for (let i = 1; i < fleet.length; i += 1) given += roadKm(fleet[i - 1], fleet[i]);
    expect(route.totalKm).toBeLessThan(given * 0.5);
  });

  it('cuts long rounds into Google Maps links of at most 10 machines that follow on', () => {
    const fleet = Array.from({ length: 23 }, (_, i) => stop(`m${i}`, -1.3, 36.7 + i * 0.01));
    const route = planRoute(fleet, { latitude: -1.3, longitude: 36.69 });
    const links = googleMapsLinks(route, { latitude: -1.3, longitude: 36.69 });
    expect(links).toHaveLength(3);
    const second = new URL(links[1].url);
    expect(second.searchParams.get('waypoints')?.split('|')).toHaveLength(9);
    // Part 2 starts where part 1 ended.
    expect(second.searchParams.get('origin')).toBe(new URL(links[0].url).searchParams.get('destination'));
    expect(links[0].label).toBe('Part 1: stops 1–10');
  });

  it('a short round is one link; without a start Google Maps uses the phone’s position', () => {
    const [link] = googleMapsLinks(planRoute(line));
    expect(link.label).toBe('Open the route in Google Maps');
    expect(new URL(link.url).searchParams.has('origin')).toBe(false);
  });

  it('ignores positions that are missing or 0,0', () => {
    expect(isUsablePosition({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isUsablePosition({ latitude: -1.28, longitude: 36.82 })).toBe(true);
    expect(isUsablePosition(null)).toBe(false);
  });
});
