/**
 * Philip's gym-trainer character (T-010, D-024): data only, no React.
 * The art is one sprite atlas (`assets/character/philip-poses.png`): owner-supplied pose art, cut out,
 * reduced to a 4× pixel grid with a shared palette and a 1-pixel outline (pipeline kept outside the
 * app). Every pose sits in a same-size cell with the feet on the bottom edge, so poses swap without
 * layout jumps. New poses, outfits or builds are new atlas cells + rows here, not new code.
 */
export type PoseId =
  | 'wave'
  | 'cross-smug'
  | 'point-up'
  | 'flex'
  | 'cross-unimpressed'
  | 'phone'
  | 'point-down-smirk'
  | 'point-down-warm'
  | 'point-down-cheer'
  | 'hair-flick'
  | 'fist-pump';

export type CharacterFraming = 'full' | 'bust';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PoseArt {
  /** Cell index in the atlas (cells laid out left to right). */
  cell: number;
  /** Head-and-shoulders crop, in cell pixels. */
  bust: Box;
}

export interface Atlas {
  key: string;
  cellW: number;
  cellH: number;
  cells: number;
  poses: Record<PoseId, PoseArt>;
}

export const ATLAS: Atlas = {
  key: 'philip-poses',
  cellW: 70,
  cellH: 126,
  cells: 11,
  poses: {
    'wave': { cell: 0, bust: { x: 18, y: 7, w: 32, h: 28 } },
    'cross-smug': { cell: 1, bust: { x: 14, y: 3, w: 32, h: 28 } },
    'point-up': { cell: 2, bust: { x: 9, y: 7, w: 32, h: 28 } },
    'flex': { cell: 3, bust: { x: 18, y: 5, w: 32, h: 28 } },
    'cross-unimpressed': { cell: 4, bust: { x: 12, y: 6, w: 32, h: 28 } },
    'phone': { cell: 5, bust: { x: 15, y: 9, w: 32, h: 28 } },
    'point-down-smirk': { cell: 6, bust: { x: 10, y: 5, w: 32, h: 28 } },
    'point-down-warm': { cell: 7, bust: { x: 13, y: 7, w: 32, h: 28 } },
    'point-down-cheer': { cell: 8, bust: { x: 11, y: 7, w: 32, h: 28 } },
    'hair-flick': { cell: 9, bust: { x: 13, y: 6, w: 32, h: 28 } },
    'fist-pump': { cell: 10, bust: { x: 24, y: 11, w: 32, h: 28 } },
  },
};

/** The crop box (in atlas pixels) for a pose and framing. */
export function frameBox(pose: PoseId, framing: CharacterFraming, atlas: Atlas = ATLAS): Box {
  const art = atlas.poses[pose];
  const local = framing === 'bust' ? art.bust : { x: 0, y: 0, w: atlas.cellW, h: atlas.cellH };
  return { x: art.cell * atlas.cellW + local.x, y: local.y, w: local.w, h: local.h };
}

/** Today's coach line → Philip's expression (owner brief, Nov 2026). */
export type CoachMood = 'left' | 'over' | 'toGo' | 'reached' | 'goalHit';
export const COACH_POSE: Record<CoachMood, PoseId> = {
  left: 'point-down-smirk',
  over: 'cross-unimpressed',
  toGo: 'flex',
  reached: 'cross-smug',
  goalHit: 'fist-pump',
};
