# Engineering backlog

This file tracks unfinished engineering work that must not be presented as completed functionality.

- Replace the legacy Nexo desktop, tray, and taskbar artwork with the approved Hearth SVG assets and regenerate the Windows icon variants.
- Complete the remaining Electron main-process extraction while keeping window, IPC, updater, and startup behavior unchanged.
- Update and rerun the Playwright selectors against the `hr-` renderer class namespace.
- Complete packaged Windows smoke checks, including verification of the executable name, unpacked native SQLite modules, and in-place update compatibility.
- Run the visual-diff comparison against the captured 0.0.8 baseline and review every changed region.
