# DownQuest
![webstore128](https://user-images.githubusercontent.com/34898868/200154927-6955b594-aeb6-4f13-a09e-a5837f9f4c4f.png)
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
