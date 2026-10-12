# DownQuest
![icon128](https://github.com/user-attachments/assets/5ff713be-b235-46f9-ae89-8d1cd69b35dc)
### A browser extension that allows you to easily downgrade and download Oculus Quest, Rift, Go, and Gear VR apps and their DLCs directly from your browser.

## Features

- Downgrade mobile app binaries and assets
- Downgrade PC app binaries and assets 
- Download DLCs
- Download DLC bundles

## Installation

DownQuest is available for the following browsers:

- [Google Chrome](https://chrome.google.com/webstore/detail/downquest/clocmpojdjmikkaepgkmplgooejmnchb)
- [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/downquest/kehkjfaenkdikagphlaphoeekoodffif)

> [!NOTE]  
> DownQuest is not currently supported on Firefox. Brave and Opera browsers may have filesystem API UI issues that prevent PCVR downloads.

## Usage

1. Navigate to [Meta Experiences](https://www.meta.com/experiences/).
2. Find the app you want to downgrade or download.
3. Log into [secure.oculus.com](https://secure.oculus.com).
4. Click one of the blue "Downgrade" buttons in the bottom right corner of the app page.
5. Choose your release channel and select the version you want to download.
6. Wait for the download to complete. For mobile apps, use ADB to sideload the APK (and OBB if applicable). For PCVR apps, launch the downloaded executable.

> [!TIP]
> When downloading PCVR apps, create a dedicated folder for downloads. DownQuest cannot download files to common directories like "Downloads" or "Desktop" due to browser security restrictions.

> [!NOTE]  
> Chrome/Edge on Windows currently restricts downloading some filetypes like .dll, .cfg and .ini which prevents some apps from downloading there. [This issue is tracked here](https://issues.chromium.org/issues/380857453). A workaround is using Chrome on Linux or macOS.

> Contains MIT licensed [zlib.js](https://github.com/imaya/zlib.js) © 2012 imaya.

## Testing a modified checkout in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Disable the installed store copy of DownQuest/DownQ to avoid duplicate buttons and downloads.
3. Click **Load unpacked** and select this repository folder (the folder containing `manifest.json`). Accept the download permission if prompted.
4. After further edits, click **Reload** on the unpacked DownQ extension and refresh the Meta game page. Refresh the game page after every extension reload: its old content script otherwise reports `Extension context invalidated`. DownQuest now shows a refresh notice and stops adding files when its runtime connection is lost.
5. Sign into your own purchased-content account at `secure.oculus.com`, open the game on Meta Experiences, and use **Downgrade** to select a release.

Mobile files are queued in Chrome's download manager without opening tabs. Batches larger than 10 files first show a review dialog with filenames, types, sizes, checkboxes and a filename filter. All files are initially selected because additional assets may be required. Nothing is queued until you click **Download selected**. Closing the dialog while it adds files stops the remaining queue; already-started transfers must be canceled in `chrome://downloads`. Chrome's download settings determine the destination and whether to prompt for each file. Asset filenames come from Meta's `file_name`; APK/OBB filenames come from the server when no filename metadata is available. Unsafe path components are removed, and existing files are kept using Chrome's filename conflict handling.

### Mobile download fix

Previously, every APK, OBB and additional asset had to pass a content-script `fetch()` using `HEAD` before DownQuest opened its URL in a tab. A signed URL that works as a browser download can reject `HEAD` with HTTP 400 or fail content-script CORS checks. The existing header rules also target `securecdn.oculus.com`, rather than regional hosts such as `securecdn-ber1-1.oculus.com`. Thus a failed probe prevented the actual download and could incorrectly suggest that the content was not owned.

Mobile transfers now use the extension service worker's `chrome.downloads` API, with the required `downloads` permission. No HEAD probe or new CORS override is used. Existing signed URL parameters and encoding are retained; the account token is appended only when the asset URI has no `access_token`. Only assets matching the selected binary ID or a unique version-code match within the requested app are queued; duplicate binary IDs/URLs are skipped. The asset query uses the established `file_name`, `uri` and `size` fields. A redacted `[DownQuest] Asset lookup summary` in the game page console reports returned binary IDs, version codes, asset counts and a failure reason without printing raw responses. Missing metadata does not prevent the selected binary and known OBB from being queued, but produces a warning that additional files may be missing. Standalone DLC downloads do not query unrelated Android versions. The existing PCVR manifest/segment flow is unchanged.

`obb_binary` identifies a traditional Android expansion file, typically named `main.<version>.<package>.obb` or `patch.<version>.<package>.obb`. `asset_files` can contain other files such as game data bundles; their original filenames and formats matter. DownQuest does not rename these files to `.obb` or assume that they all belong in `Android/obb`. Meta documents that required generic assets are installed in `/sdcard/Android/obb/<package-name>/`, preserving their filenames; being in that folder does not make a `.bundle` an OBB. Apps may also manage other content locations. [Meta asset-file documentation](https://developers.meta.com/vr/documentation/native/ps-assets/). An OBB also listed among assets is downloaded once, keeping the available filename metadata.

### Manual regression tests

**Blade & Sorcery: Nomad** (requires ownership and an authenticated Meta account):

1. Open DevTools on its Meta game page. In `chrome://extensions`, also click the unpacked extension's **service worker** link to see `[DownQuest]` download logs.
2. Choose a release known to have additional assets, then click Download once. For a large batch, expect a review dialog and no transfers until you click **Download selected**. Leave all selected to test the full build. Expect one selected APK, its OBB if the release declares one, and each distinct asset for that release. Check the asset filenames/types/sizes in the worker console against the downloaded files. Do not assume every release has an OBB.
3. Check `chrome://downloads`: all queued files should complete, with original filenames where available. Confirm that no download tabs open and that no binary-download HEAD requests occur in the game page's Network panel. The manifest probe and GraphQL requests are still expected.
4. Check that asset files are not renamed to OBBs, that the selected APK version is correct, and that a shared OBB/asset ID appears only once. Duplicate filenames from separate downloads may receive Chrome's numeric suffix.
5. Test closing the review dialog before starting: no files should download. Test selecting a few files: only those should queue. Closing the dialog while it adds files should stop further additions. Cancel one large asset in `chrome://downloads`. Expect an interrupted-download log with its filename and a reason such as `USER_CANCELED`; other files should continue. Re-select the build to request fresh URLs before retrying. There are no automatic retries with potentially expired links.
6. If a real CDN transfer fails, record the filename, size and Chrome error code. DownQuest's logs omit signed URLs and account tokens. Do not share full request URLs, HAR files or raw GraphQL responses without removing credentials.

**One previously working game**:

1. Use a purchased game/release that you previously downloaded successfully, preferably with a traditional OBB. Record its expected APK/OBB filenames and sizes before testing.
2. Select that same release with the modified extension. Confirm that its APK and OBB (if present) download successfully, with the expected names/sizes and no extra unrelated files or tabs. An APK-only release should queue only its APK.
3. If available, also try a standalone DLC asset: it should queue that asset without downloading an unrelated APK. PCVR manifest-based downloads should retain their existing directory-picker flow.

The deterministic local suite uses Chrome/Meta mocks and needs no dependencies:

```sh
node --test tests/downloads.test.cjs
```

It covers rejected cross-origin fetches, the mobile fallback call path, exact URL/authentication handling, filename preservation, OBB/asset deduplication, build matching, standalone DLCs, missing metadata, permission wiring, start failures and interruption diagnostics. Live Meta response shapes, CDN acceptance of native downloads, account entitlements, server filenames and actual file contents cannot be verified by this suite; those require the authenticated browser tests above.

Nomad browser verification returned 531 assets for the exact selected binary, including shader, environment and texture `.bundle` files. This is consistent with Unity AssetBundles ([Unity documentation](https://docs.unity.com/en-us/engine/6000.0/manual/assets-and-media/assets-managing-runtime/assetbundles-section/asset-bundles-intro)), rather than proof of unrelated downloads. The lookup does not expose required/DLC/device flags, so DownQuest does not filter based on names such as `windowsandroid`. Whether every asset is needed on a particular headset remains unverified.
