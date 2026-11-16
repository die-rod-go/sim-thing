import { describe, expect, it } from "vitest";
import type { Position } from "@village/shared";
import {
  focusCamera,
  initialCameraController,
  panCamera,
  setCameraMode,
  stepCameraController,
  zoomCameraAt,
  type CameraController,
  type CameraFrameInput,
} from "../../src/village/camera-controller";

const VIEW = { width: 1280, height: 960 };
const MAP = { width: 640, height: 480 };
const FRAME_MS = 16;
const SETTLE_FRAMES = 200;

function frameInput(
  nowMs: number,
  positions: Record<string, Position> = {},
  followedAgentId: string | null = null,
): CameraFrameInput {
  return {
    view: VIEW,
    map: MAP,
    tileSize: 16,
    positions: new Map(Object.entries(positions)),
    followedAgentId,
    nowMs,
  };
}

function settle(controller: CameraController, input: CameraFrameInput): CameraController {
  let settled = controller;
  for (let frameIndex = 1; frameIndex <= SETTLE_FRAMES; frameIndex += 1) {
    settled = stepCameraController(settled, {
      ...input,
      nowMs: input.nowMs + frameIndex * FRAME_MS,
    });
  }
  return settled;
}

function fittedController(): CameraController {
  return stepCameraController(initialCameraController, frameInput(0));
}

describe("cameraController", () => {
  it("starts fitted to the whole map", () => {
    expect(fittedController().current).toEqual({ zoom: 2, centerX: 320, centerY: 240 });
  });

  it("waits for a measured view before placing the camera", () => {
    const input = { ...frameInput(0), view: { width: 0, height: 0 } };
    expect(stepCameraController(initialCameraController, input).current).toBeNull();
  });

  it("stops fitting once the map is dragged", () => {
    const dragged = panCamera(fittedController(), 100, 0, VIEW, MAP);
    expect(dragged.mode).toBe("free");
    expect(dragged.current?.centerX).toBe(270);
  });

  it("keeps the followed agent centered as it walks", () => {
    const following = setCameraMode(fittedController(), "follow");
    const settled = settle(following, frameInput(FRAME_MS, { mara: { x: 100, y: 60 } }, "mara"));
    expect(settled.current?.centerX).toBeCloseTo(100);
    expect(settled.current?.centerY).toBeCloseTo(60);
    expect(settled.mode).toBe("follow");
  });

  it("stops following when no agent is selected", () => {
    const following = setCameraMode(fittedController(), "follow");
    expect(stepCameraController(following, frameInput(FRAME_MS)).mode).toBe("free");
  });

  it("keeps following while zooming", () => {
    const following = setCameraMode(fittedController(), "follow");
    const zoomed = zoomCameraAt(following, 2, { x: 0, y: 0 }, VIEW, MAP);
    expect(zoomed.mode).toBe("follow");
    expect(zoomed.current).toEqual({ zoom: 4, centerX: 320, centerY: 240 });
  });

  it("frames the requested agents once their positions are known", () => {
    const requested = focusCamera(fittedController(), {
      kind: "agents",
      agentIds: ["mara", "bob"],
    });
    const waiting = stepCameraController(requested, frameInput(FRAME_MS));
    expect(waiting.pendingFocus).not.toBeNull();
    const positions = { mara: { x: 100, y: 100 }, bob: { x: 164, y: 100 } };
    const served = settle(waiting, frameInput(2 * FRAME_MS, positions));
    expect(served.pendingFocus).toBeNull();
    expect(served.current?.centerX).toBeCloseTo(132);
    expect(served.mode).toBe("free");
  });
});
