import { describe, expect, it } from 'vitest';
import { haversineMetres, isAscending, sampleLandmarks, ORIGIN, WITHIN_RADIUS_M } from './geo.js';

// Pure unit tier: no database. Exercises the ordering predicate and the haversine
// helper, and confirms the fixed dataset is shaped so the integration assertions
// on ordering and inside/outside inclusion cannot pass vacuously.

describe('isAscending', () => {
  it('is true for a non-decreasing sequence including ties', () => {
    expect(isAscending([1, 2, 2, 3])).toBe(true);
  });

  it('is true for a single element and the empty list', () => {
    expect(isAscending([5])).toBe(true);
    expect(isAscending([])).toBe(true);
  });

  it('is false when any later value drops below its predecessor', () => {
    expect(isAscending([2, 1])).toBe(false);
    expect(isAscending([1, 3, 2])).toBe(false);
  });
});

describe('haversineMetres', () => {
  it('is zero from a point to itself', () => {
    expect(haversineMetres(ORIGIN, ORIGIN)).toBe(0);
  });

  it('is symmetric', () => {
    const a: [number, number] = [-0.124, 51.5117];
    const b: [number, number] = [0, 51.4769];
    expect(haversineMetres(a, b)).toBeCloseTo(haversineMetres(b, a), 6);
  });

  it('catches a [lon,lat] swap by returning a different distance', () => {
    const p: [number, number] = [-0.124, 51.5117];
    const swapped: [number, number] = [51.5117, -0.124];
    // If the coordinates were read in the wrong order the distance would change
    // by hundreds of kilometres, so a swap cannot pass unnoticed.
    expect(haversineMetres(ORIGIN, p)).not.toBeCloseTo(haversineMetres(ORIGIN, swapped), 0);
  });
});

describe('the dataset fixes a nearest-first ordering', () => {
  it('places the landmarks at strictly increasing distances from the origin', () => {
    const distances = sampleLandmarks().map((l) => haversineMetres(ORIGIN, l.location.coordinates));
    // Strictly increasing, with no ties, so the integration test asserting the
    // full ordered name sequence has exactly one correct answer.
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }
  });
});

describe('the within area splits the dataset', () => {
  it('has at least one landmark inside the radius and at least one outside', () => {
    const distances = sampleLandmarks().map((l) => haversineMetres(ORIGIN, l.location.coordinates));
    const inside = distances.filter((d) => d <= WITHIN_RADIUS_M);
    const outside = distances.filter((d) => d > WITHIN_RADIUS_M);
    // Both sides must be non-empty or the within integration test could pass
    // vacuously by including everything or nothing.
    expect(inside.length).toBeGreaterThan(0);
    expect(outside.length).toBeGreaterThan(0);
  });
});
