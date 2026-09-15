(function registerCanvasFileName(root) {
  "use strict";

  function splitFileName(name) {
    const value = String(name ?? "");
    const separator = value.lastIndexOf(".");
    const stem = value.slice(0, separator);
    const extension = value.slice(separator);
    if (separator <= 0 || !/[^.\s]/u.test(stem) || !/^\.[a-z\d]{2,10}$/i.test(extension)) {
      return { stem: value, extension: "" };
    }
    return { stem, extension };
  }

  root.REELAY_CANVAS_FILE_NAME = Object.freeze({ splitFileName });
})(typeof globalThis === "object" ? globalThis : window);
