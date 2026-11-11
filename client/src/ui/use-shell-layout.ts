import { clientConfig } from "../client-config";
import { parseStoredBoolean, parseStoredNumber } from "../format/stored-preferences";
import { useStoredState } from "./use-stored-state";

const { shell, storageKeys } = clientConfig;

const parseSidePanelWidth = (raw: string | null) =>
  parseStoredNumber(raw, shell.minSidePanelWidthPx, shell.maxSidePanelWidthPx);

export interface ShellLayout {
  sidePanelWidth: number;
  setSidePanelWidth: (width: number) => void;
  isSidePanelCollapsed: boolean;
  setIsSidePanelCollapsed: (isCollapsed: boolean) => void;
  isRosterCollapsed: boolean;
  setIsRosterCollapsed: (isCollapsed: boolean) => void;
}

/** Panel widths and collapsed states, remembered in this browser. */
export function useShellLayout(): ShellLayout {
  const [sidePanelWidth, setSidePanelWidth] = useStoredState(
    storageKeys.sidePanelWidth,
    shell.defaultSidePanelWidthPx,
    parseSidePanelWidth,
  );
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useStoredState(
    storageKeys.isSidePanelCollapsed,
    false,
    parseStoredBoolean,
  );
  const [isRosterCollapsed, setIsRosterCollapsed] = useStoredState(
    storageKeys.isRosterCollapsed,
    false,
    parseStoredBoolean,
  );
  return {
    sidePanelWidth,
    setSidePanelWidth,
    isSidePanelCollapsed,
    setIsSidePanelCollapsed,
    isRosterCollapsed,
    setIsRosterCollapsed,
  };
}
