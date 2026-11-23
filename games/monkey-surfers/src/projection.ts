import { LANE_WIDTH_WORLD } from './types';

export interface CameraState {
  width: number;
  height: number;
  z: number;
  x: number; // world x offset of camera
  y: number; // camera height above ground
  horizonY: number;
  focal: number;
  fovScale: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
}

export function createCameraState(
  width: number,
  height: number,
  playerZ: number,
  playerLaneX: number,
  playerY: number,
): CameraState {
  const minDim = Math.min(width, height);
  const fovScale = Math.max(0.75, minDim / 680);
  const camY = 3.15 + playerY * 0.68;
  const horizonY = height * 0.34 + Math.min(48, playerY * 6.5);
  return {
    width,
    height,
    z: playerZ - 5.2,
    x: playerLaneX * LANE_WIDTH_WORLD * 0.34,
    y: camY,
    horizonY,
    focal: 13.5,
    fovScale,
  };
}

/**
 * Projects a 3D world point (worldX in meters, worldY in meters above track, worldZ in meters)
 * to 2D canvas coordinates.
 */
export function projectWorld(
  cam: CameraState,
  worldX: number,
  worldY: number,
  worldZ: number,
): ProjectedPoint {
  const dz = worldZ - cam.z;
  if (dz <= 0.45) {
    return { x: cam.width * 0.5, y: cam.height * 2, scale: 0, visible: false };
  }
  const perspective = cam.focal / dz;
  const pxScale = perspective * cam.fovScale * 44;
  const sx = cam.width * 0.5 + (worldX - cam.x) * pxScale;
  const sy = cam.horizonY + (cam.y - worldY) * pxScale;
  return {
    x: sx,
    y: sy,
    scale: pxScale,
    visible: true,
  };
}

export function laneToWorldX(laneOrX: number): number {
  // laneOrX in [-1, 1] for player/ghosts, or 0/1/2 converted via (lane - 1)
  return laneOrX * LANE_WIDTH_WORLD;
}
