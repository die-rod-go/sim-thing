import { SHORTCUT_HELP } from "../format/shortcuts";
import { usePopover } from "./use-popover";

/** The `?` button; the `?` key opens it too, so its open state is lifted to the app. */
export function ShortcutsHelp({
  isOpen,
  onChange,
}: {
  isOpen: boolean;
  onChange: (isOpen: boolean) => void;
}) {
  const popover = usePopover({ isOpen, setIsOpen: onChange });

  return (
    <div className="popover-anchor" ref={popover.containerRef}>
      <button
        className={popover.isOpen ? "icon-button is-active" : "icon-button"}
        onClick={popover.toggle}
        aria-expanded={popover.isOpen}
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
      {popover.isOpen && (
        <div className="popover shortcuts-help">
          <h4>Keyboard shortcuts</h4>
          <dl>
            {SHORTCUT_HELP.map((entry) => (
              <div key={entry.keys} className="shortcut-row">
                <dt>
                  <kbd>{entry.keys}</kbd>
                </dt>
                <dd>{entry.does}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
