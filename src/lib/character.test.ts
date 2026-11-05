import { describe, expect, it } from 'vitest';
import { ATLAS, COACH_POSE, frameBox, type PoseId } from './character';

const poses = Object.keys(ATLAS.poses) as PoseId[];

describe('character atlas', () => {
  it('gives every pose its own cell inside the atlas', () => {
    const cells = poses.map((p) => ATLAS.poses[p].cell);
    expect(new Set(cells).size).toBe(poses.length);
    for (const c of cells) expect(c).toBeLessThan(ATLAS.cells);
  });

  it('keeps every bust crop inside its cell', () => {
    for (const p of poses) {
      const b = ATLAS.poses[p].bust;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(ATLAS.cellW);
      expect(b.y + b.h).toBeLessThanOrEqual(ATLAS.cellH);
    }
  });

  it('offsets frames by whole cells', () => {
    expect(frameBox('wave', 'full')).toEqual({ x: 0, y: 0, w: 70, h: 126 });
    expect(frameBox('fist-pump', 'bust')).toEqual({ x: 10 * 70 + 24, y: 11, w: 32, h: 28 });
  });

  it('maps every coach mood to a pose', () => {
    for (const p of Object.values(COACH_POSE)) expect(poses).toContain(p);
  });
});
