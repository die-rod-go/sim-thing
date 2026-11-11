import { useCallback, useEffect, useRef, useState } from "react";
import type { WorldEvent } from "@village/shared";
import { clientConfig } from "../client-config";
import type { ConversationThread } from "../format/conversations";
import { pickDirectorShot } from "./director";
import type { CameraControls } from "./use-camera-rig";

interface DirectorScene {
  threads: readonly ConversationThread[];
  events: readonly WorldEvent[];
  currentTick: number;
}

export interface Director {
  isDirectorOn: boolean;
  setDirectorOn: (isOn: boolean) => void;
}

/**
 * Director mode: every few seconds the camera cuts to the liveliest conversation. It starts off
 * and switches itself off as soon as the viewer pans, zooms, fits, follows or focuses by hand.
 */
export function useDirector(
  controls: CameraControls,
  manualInputCount: number,
  scene: DirectorScene,
): Director {
  const [isDirectorOn, setIsDirectorOn] = useState(false);
  const latestScene = useRef(scene);
  latestScene.current = scene;

  const latestInputCount = useRef(manualInputCount);
  latestInputCount.current = manualInputCount;
  const inputCountWhenStarted = useRef(manualInputCount);
  const setDirectorOn = useCallback((isOn: boolean) => {
    inputCountWhenStarted.current = latestInputCount.current;
    setIsDirectorOn(isOn);
  }, []);

  useEffect(() => {
    if (isDirectorOn && manualInputCount !== inputCountWhenStarted.current) setIsDirectorOn(false);
  }, [isDirectorOn, manualInputCount]);

  useEffect(() => {
    if (!isDirectorOn) return;
    const { directorIntervalMs, directorRecentWindowTicks } = clientConfig.camera;
    const cutToNextShot = () => {
      const { threads, events, currentTick } = latestScene.current;
      const shot = pickDirectorShot(threads, events, {
        currentTick,
        maxGapTicks: clientConfig.conversations.maxGapTicks,
        recentWindowTicks: directorRecentWindowTicks,
      });
      if (shot) controls.focus(shot, "automatic");
    };
    cutToNextShot();
    const intervalId = window.setInterval(cutToNextShot, directorIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [isDirectorOn, controls]);

  return { isDirectorOn, setDirectorOn };
}
