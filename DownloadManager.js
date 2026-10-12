// Runs in the extension service worker, where chrome.downloads is available.
function downloadFilename(name) {
  if (typeof name !== "string") return undefined;
  // Keep the original basename when possible, without allowing path traversal.
  const basename = name.split(/[\\/]/).pop()
    .replace(/[<>:"|?*\x00-\x1f\x7f]/g, "_").replace(/[. ]+$/, "");
  return basename && basename !== "." && basename !== ".." ? basename : undefined;
}

function isBinaryDownloadURL(uri) {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" &&
      (url.hostname === "oculus.com" || url.hostname.endsWith(".oculus.com")) &&
      url.pathname === "/binaries/download/" && !url.username && !url.password;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action !== "downloadBinary") return;
  // Only our Meta content script may request downloads from the Oculus CDN.
  if (sender.id !== chrome.runtime.id || !sender.tab ||
      !sender.url?.startsWith("https://www.meta.com/") ||
      !isBinaryDownloadURL(message.url)) {
    sendResponse({ ok: false, reason: "INVALID_DOWNLOAD_REQUEST" });
    return;
  }
  const filename = downloadFilename(message.filename);
  const type = ["apk", "obb", "asset"].includes(message.type) ? message.type : "asset";
  const size = Number(message.size);
  const details = {
    filename: filename || "(server filename)", type,
    size: message.size != null && Number.isFinite(size) && size >= 0 ? size : "unknown",
  };
  const options = { url: message.url, conflictAction: "uniquify" };
  // Omit filename for APK/OBB if unknown: Chrome uses Content-Disposition.
  if (filename) options.filename = filename;
  console.info("[DownQuest] Starting download", details);
  chrome.downloads.download(options, (id) => {
    const error = chrome.runtime.lastError;
    if (error || id == null) {
      // Chrome's raw error message can contain the credential-bearing URL.
      console.error("[DownQuest] Download failed to start", {
        ...details, reason: "DOWNLOAD_START_FAILED",
      });
      sendResponse({ ok: false, reason: "DOWNLOAD_START_FAILED" });
    } else {
      console.info("[DownQuest] Download queued", { ...details, id });
      sendResponse({ ok: true, id });
    }
  });
  return true;
});

// Query ownership rather than retaining signed URLs or in-memory tracking, so
// interruption diagnostics also work after the MV3 service worker restarts.
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.error && !["complete", "interrupted"].includes(delta.state?.current)) return;
  chrome.downloads.search({ id: delta.id }, (items) => {
    if (chrome.runtime.lastError) return;
    const item = items[0];
    if (!item || item.byExtensionId !== chrome.runtime.id) return;
    const details = {
      id: item.id, filename: downloadFilename(item.filename) || "(unknown)",
      mime: item.mime, size: item.totalBytes >= 0 ? item.totalBytes : "unknown",
    };
    if (item.state === "interrupted" || delta.error) {
      const reason = delta.error?.current || item.error;
      console.error("[DownQuest] Download interrupted; check chrome://downloads", {
        ...details,
        reason: /^[A-Z_]+$/.test(reason || "") ? reason : "DOWNLOAD_INTERRUPTED",
      });
    } else {
      console.info("[DownQuest] Download complete", details);
    }
  });
});
