const oculusStoreAccessToken = "OC|752908224809889|";
let accessToken = "";
let applicationID = null;
let dlcs = [];
let channelDataCache = null;
let dlcDataCache = null;
let versionDataCache = {};
let currentUrl = "";

let isDragging = false;
let draggedElement = null;
let offsetX, offsetY;
let didDragOccur = false;

document.addEventListener("DOMContentLoaded", () => {
  handleURLChange(window.location.href);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "urlChanged") {
    console.log("New URL:", request.url);
    handleURLChange(request.url);
  }
});

function handleURLChange(newUrl) {
  if (newUrl !== currentUrl) {
    currentUrl = newUrl;
    channelDataCache = null;
    dlcDataCache = null;
    versionDataCache = {};
    clearExistingButtons();
  }

  if (document.querySelector('.downquest-button-container')) {
      return;
  }

  const pathSegments = getPathSegments();
  if (!shouldShowButtons(pathSegments)) return;

  createFloatingButtons();

  applicationID = determineApplicationID(pathSegments);
  if (applicationID) {
    if (!dlcDataCache) fetchDLCData();
    if (!channelDataCache) fetchChannelData();
  }
}

function getPathSegments() {
  const path = window.location.pathname;
  const cleanedPath = path.endsWith('/') ? path.slice(0, -1) : path;
  const segments = cleanedPath.split("/").filter(Boolean);

  if (segments.length > 0 && segments[0].match(/^([a-z]{2}(-[a-z]{2})?)$/i)) {
    segments.shift();
  }
  return segments;
}

function shouldShowButtons(pathSegments) {
  if (pathSegments.length === 0 || pathSegments[0] !== "experiences") {
    return false;
  }

  if (pathSegments.length < 2) {
      return false;
  }

  const secondSegment = pathSegments[1];

  if (secondSegment === "pcvr") {
    if (pathSegments.length < 4) return false;
    const thirdSegment = pathSegments[2];
    if (["view", "section", "search"].includes(thirdSegment)) return false;
  } else {
    if (pathSegments.length < 3) return false;
    if (["view", "section", "search"].includes(secondSegment)) return false;
  }
  return true;
}

function determineApplicationID(pathSegments) {
  if (pathSegments.length > 1 && pathSegments[1] === "pcvr") {
    if (pathSegments.length >= 4) {
      return pathSegments[3];
    }
  } else {
    if (pathSegments.length >= 3) {
      return pathSegments[2];
    }
  }
  return null;
}

function clearExistingButtons() {
  document.querySelectorAll(".downquest-button-container")
    .forEach((container) => container.remove());
}

function createFloatingButtons() {
  if (!document.body) return;

  const container = document.createElement("div");
  container.className = "downquest-button-container";
  container.addEventListener("mousedown", startDrag);

  const buttonsConfig = [
    {
      text: "DLC",
      clickHandler: handleDLCButtonClick,
      modalTitle: "DLC Downloads",
      contentFunction: displayDLCs,
    },
    {
      text: "Downgrade",
      clickHandler: handleDowngradeButtonClick,
      modalTitle: "App Downgrade Options",
      contentFunction: displayDowngradeOptions,
    },
  ];

  buttonsConfig.forEach(
    ({ text, clickHandler, modalTitle, contentFunction }) => {
      const button = document.createElement("button");
      button.className = "custom-button custom-floating-button";
      button.innerText = text;

      button.addEventListener("click", async () => {
        if (didDragOccur) {
          return;
        }
        await clickHandler();
        showModal(modalTitle, contentFunction, true);
      });
      container.appendChild(button);
    }
  );

  document.body.appendChild(container);
}

async function handleDLCButtonClick() {
  if (!dlcDataCache) await fetchDLCData();
}

async function handleDowngradeButtonClick() {
  if (!channelDataCache) await fetchChannelData();
}

async function fetchChannelData() {
  if (channelDataCache) return channelDataCache;

  const requestData = buildGraphQLRequestData({
    access_token: oculusStoreAccessToken,
    variables: JSON.stringify({ applicationID }),
    doc_id: "3828663700542720",
  });

  try {
    const response = await sendGraphQLRequest(requestData);
    channelDataCache = response.data.node.release_channels.nodes.map(
      (node) => ({
        id: node.id,
        name: node.channel_name,
      }),
    );

    await Promise.all(
      channelDataCache.map((channel) => fetchVersions(channel.id)),
    );

    return channelDataCache;
  } catch (error) {
    console.error("Failed to fetch channel data:", error);
    return [];
  }
}

async function fetchDLCData() {
  if (!applicationID) {
      dlcs = [];
      dlcDataCache = [];
      return;
  }
  if (dlcDataCache) {
    dlcs = dlcDataCache;
    return;
  }

  const requestData = buildGraphQLRequestData({
    access_token: oculusStoreAccessToken,
    variables: JSON.stringify({
      id: applicationID,
      first: 10000,
    }),
    doc_id: "3853229151363174",
  });

  try {
    const response = await sendGraphQLRequest(requestData);
    const iapItemsContainer = response?.data?.node?.latest_supported_binary?.firstIapItems;

    if (!iapItemsContainer || !Array.isArray(iapItemsContainer.edges)) {
      dlcs = [];
      dlcDataCache = [];
      console.info("No DLC data found or DLC structure is empty for this application.");
      return;
    }

    dlcs = iapItemsContainer.edges.map(
      (edge) => {
        const node = edge.node;
        if (node.latest_supported_asset_file) {
          return [
            "asset",
            node.id,
            node.display_name,
            node.latest_supported_asset_file.id,
          ];
        } else if (node.bundle_items) {
          const bundle = node.bundle_items.edges.map((bundleEdge) => bundleEdge.node.id);
          return ["bundle", node.id, node.display_name, bundle];
        } else {
          return [null, node.id, node.display_name];
        }
      },
    );
    dlcDataCache = dlcs;
  } catch (error) {
    console.error("Failed to fetch DLC data due to an unexpected error:", error);
    dlcs = [];
    dlcDataCache = [];
  }
}

function buildGraphQLRequestData({ access_token, variables, doc_id }) {
  return `access_token=${access_token}&variables=${variables}&doc_id=${doc_id}`;
}

function displayDLCs(header, content) {
  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }
  const dlcSection = document.createElement("div");
  dlcSection.className = "dlc-list";

  if (!dlcs || dlcs.length === 0) {
    const noDLCMessage = document.createElement("div");
    noDLCMessage.className = "no-dlc-message";
    noDLCMessage.innerText = "No DLCs available for this game.";
    dlcSection.appendChild(noDLCMessage);
  } else {
    dlcs.forEach((dlc) => {
      if (!dlc || !dlc[1]) return;

      const dlcItem = document.createElement("div");
      dlcItem.className = "list-item";

      const infoDiv = document.createElement("div");
      infoDiv.className = "list-item-info";
      infoDiv.textContent = dlc[2] || `DLC ID: ${dlc[1]}`;
      dlcItem.appendChild(infoDiv);

      const downloadButton = createDownloadButton(dlc);
      if (downloadButton) {
        dlcItem.appendChild(downloadButton);
      }
      dlcSection.appendChild(dlcItem);
    });
  }
  content.appendChild(dlcSection);
}

function createDownloadButton(dlc) {
  if (!dlc || !dlc[0]) return null;

  if (dlc[0] === "asset" && dlc[3]) {
    const downloadButton = document.createElement("button");
    downloadButton.className = "custom-button";
    downloadButton.style.marginLeft = "10px";
    downloadButton.innerText = "Download";
    downloadButton.addEventListener("click", () => downloadBuild(dlc[3]));
    return downloadButton;
  }
  else if (dlc[0] === "bundle" && Array.isArray(dlc[3])) {
    const viewBundleButton = document.createElement("button");
    viewBundleButton.className = "custom-button";
    viewBundleButton.style.marginLeft = "10px";
    viewBundleButton.innerText = "View Items";
    viewBundleButton.addEventListener("click", () => {
      showModal(`Items in Bundle: ${dlc[2] || 'Unnamed Bundle'}`, (header, contentContainer) => {
        if (header) header.remove();

        while (contentContainer.firstChild) {
          contentContainer.removeChild(contentContainer.firstChild);
        }
        contentContainer.className = 'dlc-list';

        let itemsFound = false;
        dlc[3].forEach((id) => {
          const matchingDLC = dlcs.find((tmpDLC) => tmpDLC && tmpDLC[1] === id && tmpDLC[0] === "asset");
          if (matchingDLC && matchingDLC[3]) {
            itemsFound = true;
            createVersion(
              contentContainer,
              null,
              matchingDLC[2],
              matchingDLC[3],
              null,
              null
            );
          }
        });

        if (!itemsFound) {
          const noItemsMessage = document.createElement("div");
          noItemsMessage.className = "no-dlc-message";
          noItemsMessage.textContent = "No downloadable asset items found in this bundle.";
          contentContainer.appendChild(noItemsMessage);
        }
      });
    });
    return viewBundleButton;
  }
  else {
    return null;
  }
}

function displayDowngradeOptions(header, versions) {
  // Clear previous header/versions content
  header.textContent = ''; // Simpler clearing for text/elements
  while (versions.firstChild) {
    versions.removeChild(versions.firstChild);
  }

  // Rebuild header content
  const headerText1 = document.createTextNode("Choose the ");
  const headerText2 = document.createTextNode("release channel ");
  const headerText3 = document.createTextNode("you want to use: ");
  const boldText = document.createElement("b");
  boldText.appendChild(headerText2);
  header.appendChild(headerText1);
  header.appendChild(boldText);
  header.appendChild(headerText3);

  createChannelDropdownToggle(header, versions);
}

function createChannelDropdownToggle(header, versions) {
  fetchChannelData().then((channels) => {
    const existingDropdown = header.querySelector('.dropdown');
    if (existingDropdown) existingDropdown.remove();
    const existingMsg = header.querySelector('.no-channels-message');
    if(existingMsg) existingMsg.remove();

    while (versions.firstChild) {
      versions.removeChild(versions.firstChild);
    }

    if (!channels || channels.length === 0) {
      const noChannelsMsg = document.createElement("span");
      noChannelsMsg.textContent = " No channels available.";
      noChannelsMsg.style.marginLeft = '5px';
      noChannelsMsg.className = 'no-channels-message';
      header.appendChild(noChannelsMsg);

      const noVersionsMessage = document.createElement('div');
      noVersionsMessage.className = "no-dlc-message";
      noVersionsMessage.textContent = "No release channels found.";
      versions.appendChild(noVersionsMessage);
      return;
    }

    const dropdown = document.createElement("select");
    dropdown.className = "dropdown";

    channels.forEach((channel) => {
      const option = document.createElement("option");
      option.value = channel.id;
      option.textContent = channel.name;
      dropdown.appendChild(option);
    });

    const loadingMsg = document.createElement('div');
    loadingMsg.textContent = 'Loading versions...';
    versions.appendChild(loadingMsg);
    fetchVersions(channels[0].id, versions);

    dropdown.addEventListener("change", () => {
      const selectedChannelId = dropdown.value;
      while (versions.firstChild) {
        versions.removeChild(versions.firstChild);
      }
      const loadingMsgChange = document.createElement('div');
      loadingMsgChange.textContent = 'Loading versions...';
      versions.appendChild(loadingMsgChange);
      fetchVersions(selectedChannelId, versions);
    });

    header.appendChild(dropdown);
  }).catch(error => {
    console.error("Error setting up channel dropdown:", error);
    while (versions.firstChild) {
      versions.removeChild(versions.firstChild);
    }
    const errorMsg = document.createElement('div');
    errorMsg.className = "no-dlc-message";
    errorMsg.textContent = "Error loading channels.";
    versions.appendChild(errorMsg);
  });
}

const zIndexBase = 1000;

function showModal(title, contentFunction, closeable = true) {
  const modalCount = document.querySelectorAll(".custom-modal").length;

  const modalZIndex = zIndexBase + modalCount * 2;
  const backdropZIndex = modalZIndex - 1;

  const modal = document.createElement("div");
  modal.className = "custom-modal";
  modal.style.zIndex = modalZIndex;
  document.body.appendChild(modal);

  const backdrop = document.createElement("div");
  backdrop.className = "custom-backdrop";
  backdrop.style.zIndex = backdropZIndex;
  if (closeable) {
    backdrop.addEventListener("click", closeModal);
  }
  document.body.appendChild(backdrop);

  const titleElement = document.createElement("h2");
  titleElement.innerText = title;
  modal.appendChild(titleElement);

  const header = document.createElement("div");
  const content = document.createElement("div");

  function closeModal() {
    modal.remove();
    backdrop.remove();
  }

  contentFunction(header, content, closeModal);
  modal.appendChild(header);
  modal.appendChild(content);

  if (closeable) {
    const closeButton = document.createElement("button");
    closeButton.className = "custom-close-button";
    closeButton.innerText = "×";
    closeButton.addEventListener("click", closeModal);
    modal.appendChild(closeButton);
  }
}

async function fetchVersions(channelId, versionsContainer = null) {
  if (!channelId) return [];

  if (versionDataCache[channelId]) {
    if (versionsContainer) {
      displayVersions(versionDataCache[channelId], versionsContainer);
    }
    return versionDataCache[channelId];
  }

  if (versionsContainer) {
    while (versionsContainer.firstChild) {
      versionsContainer.removeChild(versionsContainer.firstChild);
    }
    const loadingMsg = document.createElement('div');
    loadingMsg.textContent = 'Fetching versions...';
    versionsContainer.appendChild(loadingMsg);
  }

  const requestData = buildGraphQLRequestData({
    access_token: oculusStoreAccessToken,
    variables: JSON.stringify({ releaseChannelID: channelId }),
    doc_id: "3973666182694273",
  });

  try {
    const response = await sendGraphQLRequest(requestData);
    const edges = response?.data?.node?.binaries?.edges;
    if (!edges || !Array.isArray(edges)) {
      versionDataCache[channelId] = [];
      if (versionsContainer) displayVersions([], versionsContainer);
      return [];
    }

    const versionList = edges.map((edge) => {
      const node = edge?.node;
      if (!node) return null;
      return {
        version: node.version || 'N/A',
        changeLog: node.change_log || '',
        id: node.id,
        obb: node.obb_binary,
        versionCode: node.version_code
      };
    }).filter(Boolean);

    versionDataCache[channelId] = versionList;
    if (versionsContainer) {
      displayVersions(versionList, versionsContainer);
    }
    return versionList;
  } catch (error) {
    console.error("Failed to fetch versions:", error);
    if (versionsContainer) {
      while (versionsContainer.firstChild) {
        versionsContainer.removeChild(versionsContainer.firstChild);
      }
      const errorMsg = document.createElement('div');
      errorMsg.className = "no-dlc-message";
      errorMsg.textContent = "Error fetching versions.";
      errorMsg.style.color = 'red';
      versionsContainer.appendChild(errorMsg);
    }
    versionDataCache[channelId] = undefined;
    return [];
  }
}

function displayVersions(versionList, versionsContainer) {
  while (versionsContainer.firstChild) {
    versionsContainer.removeChild(versionsContainer.firstChild);
  }
  versionsContainer.className = 'downgrade-section';

  if (!versionList || versionList.length === 0) {
    const noVersionsMessage = document.createElement("div");
    noVersionsMessage.textContent = "No versions available for this channel.";
    noVersionsMessage.className = "no-dlc-message";
    versionsContainer.appendChild(noVersionsMessage);
  } else {
    versionList.forEach((version) => {
      if (!version || !version.id) return;
      createVersion(
        versionsContainer,
        version.version,
        version.changeLog,
        version.id,
        version.obb,
        version.versionCode
      );
    });
  }
}

function sendGraphQLRequest(requestData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const graphURI = "https://graph.oculus.com/graphql";
    xhr.open("POST", graphURI, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } else {
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            if (errorResponse.error && errorResponse.error.code === 190) {
              showModal("Session Error", (header, _) => {
                const headerText1 = document.createTextNode(
                  "Error validating access token. Please log into ",
                );
                const headerText3 = document.createTextNode(" and try again.");
                const link = document.createElement("a");
                link.className = "custom-link";
                link.href = "https://secure.oculus.com";
                link.target = "_blank";
                link.textContent = "secure.oculus.com";
                header.appendChild(headerText1);
                header.appendChild(link);
                header.appendChild(headerText3);
              });
            } else {
              console.error(
                "Request failed with status:",
                xhr.status,
                xhr.responseText,
              );
            }
          } catch (e) {
            console.error("Failed to parse error response:", e);
          }
          reject(xhr.status);
        }
      }
    };
    xhr.send(requestData);
  });
}

function createVersion(parentContainer, version, changeLog, id, obb, versionCode) {
  const versionRow = document.createElement("div");
  versionRow.className = "list-item";

  const infoDiv = document.createElement("div");
  infoDiv.className = "list-item-info";

  let primaryText = "";
  if (version && version !== 'N/A') {
    primaryText = `Version: ${version}`;
    if (versionCode) primaryText += ` (Code: ${versionCode})`;
  } else if (versionCode) {
    primaryText = `Version Code: ${versionCode}`;
  } else {
    primaryText = changeLog || `Asset ID: ${id}`;
    changeLog = null;
  }
  infoDiv.textContent = primaryText;

  if (changeLog) {
    const changeLogSpan = document.createElement("span");
    changeLogSpan.textContent = `Changelog: ${changeLog || '–'}`;
    infoDiv.appendChild(changeLogSpan);
  }

  const downloadButton = document.createElement("button");
  downloadButton.className = "custom-button";
  downloadButton.innerText = "Download";
  downloadButton.addEventListener("click", () => {
    downloadBuild(id, versionCode, obb ? obb.id : null);
  });

  versionRow.appendChild(infoDiv);
  versionRow.appendChild(downloadButton);

  parentContainer.appendChild(versionRow);
}

async function downloadBuild(binaryId, versionCode, obbId) {
  chrome.runtime.sendMessage("Me want cookie!", async (response) => {
    accessToken = response;
    if (accessToken) {
      try {
        const manifestResponse = await fetch(getManifestURI(binaryId));
        if (manifestResponse.status === 200) {
          const arrayBuffer = await manifestResponse.arrayBuffer();
          const unzip = new Zlib.Unzip(new Uint8Array(arrayBuffer));
          const manifest = unzip.decompress("manifest.json");
          const manifestJSON = JSON.parse(new TextDecoder().decode(manifest));
          const files = manifestJSON.files;

          window.onbeforeunload = () =>
            "You are about to leave this page. Your download will not complete.";

          const customContent = async (header, versions, closeModal) => {
            const headerText1 = document.createTextNode(
              "Currently downloading: ",
            );
            const headerText2 = document.createTextNode(
              manifestJSON.canonicalName,
            );
            const boldText = document.createElement("b");
            boldText.appendChild(headerText2);
            header.appendChild(headerText1);
            header.appendChild(boldText);

            try {
              const progressIndicator = createProgressIndicator(versions);
              let dirHandle;
              try {
                dirHandle = await self.showDirectoryPicker({
                  startIn: "downloads",
                });
                while (
                  (await dirHandle.queryPermission({ mode: "readwrite" })) !==
                  "granted"
                ) {
                  await dirHandle.requestPermission({ mode: "readwrite" });
                }
              } catch (e) {
                closeModal();
                return;
              }

              for (let i = 0; true; i++) {
                let directoryName =
                  i === 0
                    ? manifestJSON.canonicalName
                    : `${manifestJSON.canonicalName} (${i})`;
                try {
                  await dirHandle.getDirectoryHandle(directoryName);
                } catch {
                  dirHandle = await dirHandle.getDirectoryHandle(
                    directoryName,
                    { create: true },
                  );
                  break;
                }
              }

              const totalSize = Object.values(files).reduce(
                (total, file) => total + file.size,
                0,
              );
              let currentSize = 0;

              const downloadFile = async (key) => {
                let path = key.split(/\\|\//);
                let currentDir = dirHandle;
                while (path.length > 1) {
                  currentDir = await currentDir.getDirectoryHandle(
                    path.shift(),
                    { create: true },
                  );
                }

                try {
                  let newFileHandle;
                  try {
                    newFileHandle = await currentDir.getFileHandle(path, {
                      create: true,
                    });
                  } catch (error) {
                    if (error.name === "TypeError") {
                      console.error(
                        "getFileHandle failed due to restricted file type:",
                        error,
                      );
                      const errorMSG = document.createElement("div");
                      errorMSG.textContent = `Download failed for file "${path.join("/")}". This issue is a Chrome restrictions on Windows for certain file types like .dll, .ini, and .cfg. Use Linux or macOS if possible.`;
                      errorMSG.style.color = "red";
                      versions.appendChild(errorMSG);
                      return;
                    } else {
                      throw error;
                    }
                  }

                  const writable = await newFileHandle.createWritable();

                  for (const segment of files[key].segments) {
                    const response = await fetch(
                      getSegmentURI(binaryId, segment[1]),
                    );
                    const arrayBuffer = await response.arrayBuffer();
                    const inflate = new Zlib.Inflate(
                      new Uint8Array(arrayBuffer),
                    );
                    const inflated = inflate.decompress();
                    await writable.write(inflated);
                    currentSize += segment[2];
                    progressIndicator.style.width =
                      (currentSize / totalSize) * 100 + "%";
                  }
                  await writable.close();
                } catch (error) {
                  console.error(
                    "An unexpected error occurred during download:",
                    error,
                  );
                  const errorMSG = document.createElement("div");
                  errorMSG.textContent = `An unexpected error occurred: ${error.message}`;
                  errorMSG.style.color = "red";
                  versions.appendChild(errorMSG);
                }
              };

              await Promise.all(Object.keys(files).map(downloadFile));

              closeModal();
              window.onbeforeunload = null;
            } catch (e) {
              console.error(e);
              const errorMSG = document.createElement("div");
              const error = document.createTextNode(e);
              errorMSG.appendChild(error);
              errorMSG.style.color = "red";
              versions.appendChild(errorMSG);
              window.onbeforeunload = null;
            }
          };
          showModal("Downloading...", customContent, false);
        } else {
          console.info("Probably a mobile build (or not purchased)");
          if (obbId != null) {
            openURI(getDownloadURI(obbId), true);
          }
          const requestData = buildAppBinaryInfoRequestData(
            applicationID,
            versionCode,
          );
          sendGraphQLRequest(requestData)
            .then((response) => {
              const binary = response.data.app_binary_info.info[0].binary;
              if (binary != null) {
                const edges = binary.asset_files.edges;
                if (edges.length < 1) {
                  openURI(getDownloadURI(binaryId), true);
                } else {
                  openURI(getDownloadURI(binary.id), true);
                  edges.forEach((edge) => {
                    openURI(
                      `${edge.node.uri}&access_token=${accessToken}`,
                      false,
                    );
                  });
                }
              } else {
                openURI(getDownloadURI(binaryId), true);
              }
            })
            .catch();
        }
      } catch (error) {
        console.error("Network error:", error);
      }
    } else {
      const customContent = (header, versions) => {
        const headerText1 = document.createTextNode(
          "No oculus.com login found, please log into ",
        );
        const headerText2 = document.createTextNode("secure.oculus.com");
        const headerText3 = document.createTextNode(" and try again");
        const link = document.createElement("a");
        link.className = "custom-link";
        link.href = "https://secure.oculus.com";
        link.target = "_blank";
        link.appendChild(headerText2);
        header.appendChild(headerText1);
        header.appendChild(link);
        header.appendChild(headerText3);
      };

      showModal("No access_token found", customContent);
    }
  });
}

function buildAppBinaryInfoRequestData(appId, versionCode) {
  return `access_token=${accessToken}&doc=query ($params: AppBinaryInfoArgs!) { app_binary_info(args: $params) { info { binary { ... on AndroidBinary { id package_name version_code asset_files { edges { node { ... on AssetFile { file_name uri size } } } } } } } }}&variables={\"params\":{\"app_params\":[{\"app_id\":\"${appId}\",\"version_code\":\"${versionCode}\"}]}}`;
}

async function openURI(uri, important) {
  try {
    const response = await fetch(uri, {
      method: "HEAD",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (response.ok) {
      window.open(uri, "_blank");
    } else {
      console.info(
        "Couldn't access " + uri + " because you probably haven't purchased it",
      );
      if (important) {
        const customContent = (header, _) => {
          const headerText = document.createTextNode(
            "It seems like DownQuest wasn't able to generate all required download links. This is most likely the case because you don't own the content or have been logged out.",
          );
          header.appendChild(headerText);
        };
        showModal("Info", customContent);
      }
    }
  } catch (error) {
    console.error("Network error:", error);
  }
}

function createProgressIndicator(parent) {
  const progressIndicatorBackground = document.createElement("div");
  progressIndicatorBackground.className = "progress-indicator-background";
  parent.appendChild(progressIndicatorBackground);

  const progressIndicator = document.createElement("div");
  progressIndicator.className = "progress-indicator";
  progressIndicatorBackground.appendChild(progressIndicator);

  return progressIndicator;
}

function getManifestURI(id) {
  return `https://securecdn.oculus.com/binaries/download/?access_token=${accessToken}&id=${id}&get_manifest=1`;
}

function getDownloadURI(id) {
  return `https://securecdn.oculus.com/binaries/download/?id=${id}&access_token=${accessToken}`;
}

function getSegmentURI(binaryId, segmentSha256) {
  return `https://securecdn.oculus.com/binaries/segment/?access_token=${accessToken}&binary_id=${binaryId}&segment_sha256=${segmentSha256}`;
}

function startDrag(e) {
  if (e.button !== 0 || e.target.tagName === 'BUTTON') return;

  draggedElement = e.currentTarget;
  isDragging = true;
  didDragOccur = false;
  draggedElement.classList.add("dragging");

  const rect = draggedElement.getBoundingClientRect();
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;

  draggedElement.style.position = 'fixed';
  draggedElement.style.bottom = 'auto'; // Override initial bottom/right
  draggedElement.style.right = 'auto';
  draggedElement.style.left = `${rect.left}px`;
  draggedElement.style.top = `${rect.top}px`;

  document.addEventListener("mousemove", handleDrag, { passive: false });
  document.addEventListener("mouseup", stopDrag);

  e.preventDefault();
}

function handleDrag(e) {
  if (!isDragging || !draggedElement) return;
  didDragOccur = true;

  let newX = e.clientX - offsetX;
  let newY = e.clientY - offsetY;

  const PADDING = 5;
  newX = Math.max(PADDING, Math.min(newX, window.innerWidth - draggedElement.offsetWidth - PADDING));
  newY = Math.max(PADDING, Math.min(newY, window.innerHeight - draggedElement.offsetHeight - PADDING));

  draggedElement.style.left = `${newX}px`;
  draggedElement.style.top = `${newY}px`;

  e.preventDefault();
}

function stopDrag() {
  if (!isDragging || !draggedElement) return;

  isDragging = false;
  draggedElement.classList.remove("dragging");

  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDrag);

  setTimeout(() => { didDragOccur = false; }, 0);

  draggedElement = null;
}
