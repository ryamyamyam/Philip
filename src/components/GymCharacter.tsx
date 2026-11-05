import type { CSSProperties } from 'react';
import atlasUrl from '../assets/character/philip-poses.png';
import { ATLAS, frameBox, type CharacterFraming, type PoseId } from '../lib/character';

export interface GymCharacterProps {
  pose: PoseId;
  /** `full` = whole body; `bust` = head and shoulders. */
  framing?: CharacterFraming;
  /** Whole-number zoom so the pixels stay crisp. */
  scale?: 1 | 2 | 3;
  /** A gentle one-pixel bob while he talks. */
  talking?: boolean;
  className?: string;
}

/**
 * Philip's gym-trainer character (T-010, D-024): one pose from the sprite atlas, drawn with
 * `image-rendering: pixelated` at a whole-number scale, transparent background, always decorative.
 * Sizes and offsets are sprite geometry (atlas pixels × scale), passed as custom properties.
 */
export function GymCharacter({ pose, framing = 'full', scale = 2, talking = false, className }: GymCharacterProps) {
  const box = frameBox(pose, framing);
  const style = {
    '--char-w': `${box.w * scale}px`,
    '--char-h': `${box.h * scale}px`,
    '--char-px': `${scale}px`,
    backgroundImage: `url(${atlasUrl})`,
    backgroundSize: `${ATLAS.cellW * ATLAS.cells * scale}px ${ATLAS.cellH * scale}px`,
    backgroundPosition: `${-box.x * scale}px ${-box.y * scale}px`,
  } as CSSProperties;
  return (
    <div
      className={`pm-char${talking ? ' is-talking' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
      data-pose={pose}
      data-framing={framing}
    />
  );
}
