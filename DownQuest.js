const pathname = window.location.pathname.split("/").filter((item) => item);

let applicationID;

if ("pcvr" == pathname[2]) {
  applicationID = pathname[3];
} else {
  applicationID = pathname[2];
}

let access_token = "";

const oculus_store_access_token = "OC|752908224809889|";

let DLCs = [];

window.addEventListener("load", main, false);

function waitForElement(selector) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver((_) => {
      if (document.querySelector(selector)) {
        resolve(document.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

async function main() {
  injectStyle();
  //chrome.runtime.sendMessage("Me want cookie!", async (response) => {
  //access_token = response;
  if (pathname.length == 3 || pathname.length == 4) {
    //await waitForElement('.app__info');
    await waitForElement("._anbb, ._anb8");
    injectButtons();

    await waitForElement("._an67"); //.app-downloadable-content-section__items
    //if (document.getElementsByClassName("app-downloadable-content-section__items").length >= 1) {
    createDLCButtons();
    //}
  }
  //})
}

function injectStyle() {
  const styles = `.button--green { background-color: #00a400 }
    .button--green:hover,.button--green:focus { background-color: #05B305 }
    .button--green:active { background-color: #1CE61C }`;

  const css = document.createElement("style");
  css.type = "text/css";
  css.innerHTML = styles;
  document.head.appendChild(css);
}

function createDLCButtons() {
  const requestData = `access_token=${oculus_store_access_token}&variables={"id":"${applicationID}", "first": 10000, "last": null, "after": null, "before": null, "forward": true}&doc_id=3853229151363174`;
  createAndSendRequest(requestData)
    .then((response) => {
      response.data.node.latest_supported_binary.firstIapItems.edges.forEach(
        function (edge) {
          if (edge.node.latest_supported_asset_file != undefined) {
            DLCs.push([
              "asset",
              edge.node.id,
              edge.node.display_name,
              edge.node.latest_supported_asset_file.id,
            ]);
          } else if (edge.node.bundle_items != undefined) {
            let bundle = [];
            edge.node.bundle_items.edges.forEach(function (edge) {
              bundle.push(edge.node.id);
            });
            DLCs.push(["bundle", edge.node.id, edge.node.display_name, bundle]);
          } else {
            DLCs.push([null, edge.node.id, edge.node.display_name]);
          }
        },
      );
      //app-downloadable-content-item
      const DLCItems = document.getElementsByClassName("_an75");
      for (let i = 0; i < DLCItems.length; i++) {
        injectDLCButton(i, DLCs[i]);
      }
      //app-downloadable-content-section__items
      DLCObserver.observe(document.getElementsByClassName("_an67")[0], {
        subtree: false,
        childList: true,
      });
    })
    .catch((error) => {
      console.error(error);
    });
}

function getDLCPage() {
  return parseInt(document.getElementsByClassName("_an7k")[0].innerText) - 1; //app-review-pager__number--current
}

const DLCObserver = new MutationObserver(function (mutations_list) {
  let i = 0;
  mutations_list.forEach(function (mutation) {
    mutation.addedNodes.forEach(function (added_node) {
      injectDLCButton(i, DLCs[i + getDLCPage() * 5]);
      i++;
    });
  });
});

function injectDLCButton(i, DLC) {
  //app-downloadable-content-item__right
  const anchor = document.getElementsByClassName("_an79")[i];
  const button = document.createElement("button");
  anchor.style.gridRowGap = "8px";
  button.classList.add("_an6j"); //button--height-tall
  button.classList.add("button--green");
  button.classList.add("_an6i"); //button
  if (DLC[0] == "asset") {
    button.addEventListener("click", function () {
      downloadBuild(DLC[3]);
    });
  } else if (DLC[0] == "bundle") {
    button.addEventListener("click", function () {
      const customContent = function (header, versions) {
        const headerText1 = document.createTextNode("Selected bundle: ");
        const headerText2 = document.createTextNode(DLC[2]);
        const b = document.createElement("b");
        b.appendChild(headerText2);
        header.appendChild(headerText1);
        header.appendChild(b);

        DLC[3].forEach(function (id) {
          DLCs.forEach(function (tmpDLC) {
            if (tmpDLC[1] == id && tmpDLC[0] == "asset") {
              createVersion(versions, null, tmpDLC[2], tmpDLC[3]);
            }
          });
        });
      };
      showModal("Download DLC from bundle!", customContent);
    });
  } else {
    button.classList.add("_an6m"); //button--disabled
  }

  const span = document.createElement("span");
  span.classList.add("app-purchase-price");
  button.appendChild(span);
  const text = document.createTextNode("Download");
  span.appendChild(text);

  anchor.append(button);
}

function injectButtons() {
  const anchors = Array.from(document.querySelectorAll("._anbb, ._ankg")); //app-purchase__purchase-button

  const modalContent = function customHeader(header, versions) {
    const headerText1 = document.createTextNode("Choose the ");
    const headerText2 = document.createTextNode("release channel ");
    const headerText3 = document.createTextNode("you want to use: ");
    const b = document.createElement("b");
    header.appendChild(headerText1);
    header.appendChild(b);
    b.appendChild(headerText2);
    header.appendChild(headerText3);

    createChannelDropdownToggle(header, versions);
  };

  for (let i = 0; i < anchors.length; i++) {
    const button = document.createElement("button");
    anchors[i].style.gridRowGap = "8px";
    anchors[i].style.display = "grid";
    button.addEventListener("click", function () {
      showModal("Downgrade this app!", modalContent);
    });
    button.classList.add("_an6j"); //button--height-tall
    button.classList.add("button--green");
    button.classList.add("_an6i"); //button

    const span = document.createElement("span");
    span.classList.add("app-purchase-price");

    const text = document.createTextNode("Downgrade");
    button.appendChild(text);

    anchors[i].append(button);
  }
}

function showModal(titleString, customContent, closeable = true) {
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";

  const closeModal = function closeModal() {
    document.body.style.overflow = null;
    document.body.style.position = null;
    root.remove();
  };

  const root = document.createElement("div");
  //root.classList.add("sky-modal__root");
  root.classList.add("x9f619", "x1n2onr6", "x1ja2u2z");
  document.body.appendChild(root);

  const backdrop = document.createElement("div");
  backdrop.classList.add(
    "x1ey2m1c",
    "xds687c",
    "xixxii4",
    "x17qophe",
    "x13vifvy",
    "x1t853zo",
    "xa3vuyk",
    "x6o7n8i",
    "x1hc1fzr",
    "xeg22mp",
  ); //sky-modal__backdrop
  if (closeable) {
    backdrop.addEventListener("click", closeModal); // doesn't trigger :c
  }
  root.appendChild(backdrop);

  const modal1 = document.createElement("div");
  modal1.classList.add(
    "x1ey2m1c",
    "x78zum5",
    "xdt5ytf",
    "xl56j7k",
    "xgqtt45",
    "xixxii4",
    "x3m8u43",
    "x13vifvy",
    "x1hc1fzr",
  ); //sky-modal
  root.appendChild(modal1);

  const modal2 = document.createElement("div");
  modal2.classList.add("x78zum5", "xl56j7k");
  modal1.appendChild(modal2);

  const modal3 = document.createElement("div");
  modal3.classList.add(
    "xgwl07f",
    "x1lq5wgf",
    "xgqcy7u",
    "x30kzoy",
    "x9jhf4c",
    "x1j8fuow",
    "x78zum5",
    "xdt5ytf",
    "xhd83ik",
    "x10rn61k",
    "xpt360o",
    "xmnoj47",
    "xyp16gn",
  );
  modal2.appendChild(modal3);

  const modal4 = document.createElement("div");
  modal4.classList.add(
    "xb57i2i",
    "x1q594ok",
    "x5lxg6s",
    "x78zum5",
    "xdt5ytf",
    "x6ikm8r",
    "x1ja2u2z",
    "x1pq812k",
    "x1rohswg",
    "x1yqm8si",
    "xjx87ck",
    "xx8ngbg",
    "xwo3gff",
    "x1oyok0e",
    "x1odjw0f",
    "x1e4zzel",
    "x1iyjqo2",
    "xdl72j9",
    "x1n2onr6",
  );
  modal3.appendChild(modal4);

  const title = document.createElement("div");
  title.classList.add(
    "xso031l",
    "x1q0q8m5",
    "x1kux67n",
    "x78zum5",
    "xl56j7k",
    "x21xpn4",
    "xyamay9",
    "x1pi30zi",
    "x1l90r2v",
    "x1swvt13",
    "x1aueamr",
    "x1s688f",
  ); //sky-modal__title
  modal4.appendChild(title);

  const titleName = document.createElement("div");
  titleName.classList.add("x1iyjqo2", "x2b8uid"); //sky-modal__title-name
  title.appendChild(titleName);

  const titleText = document.createTextNode(titleString);
  titleName.appendChild(titleText);

  if (closeable) {
    const titleClose = document.createElement("div");
    titleClose.classList.add(
      "x1i10hfl",
      "x1qjc9v5",
      "xjbqb8w",
      "xjqpnuy",
      "xa49m3k",
      "xqeqjp1",
      "x2hbi6w",
      "x13fuv20",
      "xu3j5b3",
      "x1q0q8m5",
      "x26u7qi",
      "x972fbf",
      "xcfux6l",
      "x1qhh985",
      "xm0m39n",
      "x9f619",
      "x1ypdohk",
      "xdl72j9",
      "xdt5ytf",
      "x2lah0s",
      "xe8uvvx",
      "xdj266r",
      "x11i5rnm",
      "xat24cr",
      "x1mh8g0r",
      "x2lwn1j",
      "xeuugli",
      "xexx8yu",
      "x4uap5",
      "x18d9i69",
      "xkhd6sd",
      "x16tdsg8",
      "xggy1nq",
      "x1ja2u2z",
      "x1t137rt",
      "x1hl2dhg",
      "x1lku1pv",
      "x1n2onr6",
      "x1rg5ohu",
    );
    title.appendChild(titleClose);

    const titleCloseIcon = document.createElement("i");
    titleCloseIcon.style =
      "background-image: url('https://static.xx.fbcdn.net/rsrc.php/v3/yJ/r/YKage5MIYCR.png'); background-position: -149px -159px; background-size: 228px 358px; width: 24px; height: 24px; background-repeat: no-repeat; display: inline-block;";
    titleCloseIcon.addEventListener("click", closeModal);
    titleClose.appendChild(titleCloseIcon);
  }

  const content = document.createElement("div");
  content.classList.add("_ao0o"); //sky-modal__content
  modal4.appendChild(content);

  const header = document.createElement("div");
  header.classList.add("_anc1"); //app-details-supported-modes-modal__header
  content.appendChild(header);

  const versions = document.createElement("div");
  content.appendChild(versions);

  customContent(header, versions, closeModal);
}

function createChannelDropdownToggle(parent, versions) {
  let items = [];

  const requestData = `access_token=${oculus_store_access_token}&variables={"applicationID":"${applicationID}"}&doc_id=3828663700542720`;
  createAndSendRequest(requestData)
    .then((response) => {
      response.data.node.release_channels.nodes.forEach(function (node) {
        items.push([node.id, node.channel_name]);
      });

      const selected = 0;
      createDropdownToggle(parent, items, selected, function _action(index) {
        createVersions(versions, items[index][0]);
      });
      createVersions(versions, items[selected][0]);
    })
    .catch((error) => {
      console.error(error);
    });
}

function createDropdownToggle(parent, items, selected, action) {
  const dropdownToggle = document.createElement("a");
  dropdownToggle.classList.add("_an0_"); //sky-dropdown__toggle
  dropdownToggle.classList.add("_annb", "_anmo");
  dropdownToggle.href = "#?";
  dropdownToggle.addEventListener("click", function _destroy() {
    createDropdown(dropdownToggle, items, selected, action, function () {
      dropdownToggle.removeEventListener("click", _destroy, false);
    });
  });
  parent.appendChild(dropdownToggle);

  const toggleStatus = document.createElement("span");
  toggleStatus.classList.add("_an10"); //sky-dropdown__toggle__status
  dropdownToggle.appendChild(toggleStatus);

  toggleStatus.appendChild(
    document.createTextNode("(" + items[selected][1] + ")"),
  );

  //if (items.length > 1) {
  const toggleCaret = document.createElement("i");
  toggleCaret.classList.add("_an4y");
  toggleCaret.style =
    "background-image: url('https://static.xx.fbcdn.net/rsrc.php/v3/yJ/r/YKage5MIYCR.png'); background-position: -49px -159px; background-size: 228px 358px; width: 24px; height: 24px; background-repeat: no-repeat; display: inline-block;";
  dropdownToggle.appendChild(toggleCaret);
  //}
}

function createDropdown(dropdownToggle, items, selected, action, destroy) {
  const bottom = document.createElement("div");
  bottom.classList.add(
    "xu96u03",
    "xm80bdy",
    "x10l6tqk",
    "x13vifvy",
    "x1q2oy4v",
  );
  //bottom.classList.add("sky-dropdown__bottom");
  //bottom.classList.add("sky-dropdown");
  const rect = dropdownToggle.getBoundingClientRect();
  bottom.style.left = rect.left + window.pageXOffset - 125.406 + "px";
  bottom.style.top = rect.top + window.pageYOffset + 24 + "px";
  document.body.appendChild(bottom);

  const list = document.createElement("div");
  list.classList.add("_an0d", "_an0j"); //sky-dropdown__list
  bottom.appendChild(list);

  items.forEach(function (val, index) {
    const item = document.createElement("li");
    item.classList.add("_an0v"); //sky-dropdown__item
    if (index == selected) {
      item.classList.add("_an0w"); //sky-dropdown__item--selected
    }

    list.appendChild(item);

    const link = document.createElement("div");
    link.classList.add("_an11"); //sky-dropdown__link
    //link.classList.add("link--clickable");
    link.addEventListener("click", function _func() {
      switchDropdown(dropdownToggle, items, index, action, destroy);
    });
    link.appendChild(document.createTextNode(val[1]));
    item.appendChild(link);
  });
  document.body.addEventListener(
    "click",
    function _func() {
      closeDropdown(bottom);
    },
    true,
  );
}

function closeDropdown(dropdown) {
  document.body.removeEventListener("click", closeDropdown, true);
  dropdown.remove();
}

function switchDropdown(dropdownToggle, items, index, action, destroy) {
  const releaseChannelName = items[index][1];
  const toggleText = dropdownToggle.firstChild.firstChild;
  toggleText.nodeValue = "(" + releaseChannelName + ")";

  action(index);
  destroy();

  dropdownToggle.addEventListener("click", function _destroy() {
    createDropdown(dropdownToggle, items, index, action, function () {
      dropdownToggle.removeEventListener("click", _destroy, false);
    });
  });
}

function createAndSendRequest(sendArgs) {
  return new Promise((resolve, reject) => {
    const transport = new XMLHttpRequest();
    const graphURI = "https://graph.oculus.com/graphql";
    transport.withCredentials = true;
    transport.open("POST", graphURI, true);
    transport.setRequestHeader(
      "Content-Type",
      "application/x-www-form-urlencoded",
    );
    transport.onreadystatechange = function () {
      if (transport.readyState === 4) {
        if (transport.status == 200) {
          resolve(JSON.parse(transport.responseText));
        } else {
          reject(transport.status);
        }
      }
    };
    transport.send(sendArgs);
  });
}

function createVersions(versions, releaseChannelID) {
  while (versions.firstChild) {
    versions.removeChild(versions.firstChild);
  }

  const loading = document.createElement("div");
  loading.innerText = "Loading...";
  versions.appendChild(loading);

  const requestData = `access_token=${oculus_store_access_token}&variables={"releaseChannelID":"${releaseChannelID}"}&doc_id=3973666182694273`;

  createAndSendRequest(requestData)
    .then((response) => {
      loading.remove();
      let version_list = response.data.node.binaries.edges;
      for (const val of version_list) {
        createVersion(
          versions,
          val.node.version,
          val.node.change_log,
          val.node.id,
          val.node.obb_binary,
          val.node.version_code,
        );
      }
    })
    .catch((error) => {
      console.error(error);
    });
}

function createVersion(versions, version, text, id, obb, version_code) {
  const row = document.createElement("div");
  row.classList.add("_anb-"); //app-details-supported-modes-modal__row
  versions.appendChild(row);

  const description = document.createElement("a");
  description.classList.add("_annb", "_anmo"); //link--clickable
  description.addEventListener("click", function _func() {
    if (obb != undefined) {
      downloadBuild(id, version_code, obb.id);
    } else {
      downloadBuild(id, version_code, null);
    }
  });
  if (text == "") {
    text = "N/A";
  }
  if (version != undefined) {
    description.appendChild(document.createTextNode(`${version} | ${text}`));
  } else {
    description.appendChild(document.createTextNode(text));
  }
  row.appendChild(description);
}

function getManifestURI(id) {
  return `https://securecdn.oculus.com/binaries/download/?access_token=${access_token}&id=${id}&get_manifest=1`;
}

function getDownloadURI(id) {
  return `https://securecdn.oculus.com/binaries/download/?id=${id}`;
}

function getSegmentURI(binary_id, segment_sha256) {
  return `https://securecdn.oculus.com/binaries/segment/?access_token=${access_token}&binary_id=${binary_id}&segment_sha256=${segment_sha256}`;
}

function createProgressIndicator(parent) {
  const progressIndicatorBackground = document.createElement("div");
  progressIndicatorBackground.classList.add("_an9b"); //app-ratings-histogram__bar__bg
  parent.appendChild(progressIndicatorBackground);

  const progressIndicator = document.createElement("div");
  progressIndicator.classList.add("_an9c"); //app-ratings-histogram__bar__fg
  progressIndicatorBackground.appendChild(progressIndicator);

  return progressIndicator;
}

async function downloadBuild(binary_id, version_code, obb_id) {
  chrome.runtime.sendMessage("Me want cookie!", async (response) => {
    access_token = response;
    if (null != access_token) {
      fetch(getManifestURI(binary_id))
        .then(function (response) {
          if (response.status == 200) {
            response
              .arrayBuffer()
              .then(async function (arrayBuffer) {
                const unzip = new Zlib.Unzip(new Uint8Array(arrayBuffer));
                const manifest = unzip.decompress("manifest.json");

                const manifestJSON = JSON.parse(
                  new TextDecoder().decode(manifest),
                );
                const files = manifestJSON.files;

                window.onbeforeunload = function () {
                  return "You are about to leave this page. Your download will not complete.";
                };

                const customContent = async function customContent(
                  header,
                  versions,
                  closeModal,
                ) {
                  const headerText1 = document.createTextNode(
                    "Currently downloading: ",
                  );
                  const headerText2 = document.createTextNode(
                    manifestJSON.canonicalName,
                  );
                  const b = document.createElement("b");
                  b.appendChild(headerText2);
                  header.appendChild(headerText1);
                  header.appendChild(b);

                  try {
                    const progressIndicator = createProgressIndicator(versions);
                    let dirHandle;
                    try {
                      dirHandle = await self.showDirectoryPicker({
                        startIn: "downloads",
                      });
                      while (
                        (await dirHandle.queryPermission({
                          mode: "readwrite",
                        })) !== "granted"
                      ) {
                        await dirHandle.requestPermission({
                          mode: "readwrite",
                        });
                      }
                    } catch (e) {
                      closeModal();
                      return;
                    }

                    for (let i = 0; true; i++) {
                      let directoryName;
                      if (i == 0) {
                        directoryName = manifestJSON.canonicalName;
                      } else {
                        directoryName = `${manifestJSON.canonicalName} (${i})`;
                      }
                      try {
                        await dirHandle.getDirectoryHandle(directoryName);
                      } catch {
                        dirHandle = await dirHandle.getDirectoryHandle(
                          directoryName,
                          {
                            create: true,
                          },
                        );
                        break;
                      }
                    }

                    const totalSize = Object.values(files).reduce(
                      (total, file) => total + file.size,
                      0,
                    );
                    let currentSize = 0;

                    for await (const [i, key] of Object.keys(files).entries()) {
                      console.log(key);
                      console.log("segments: " + files[key].segments.length);
                      console.log("size: " + files[key].size);

                      let path = key.split(/\\|\//);
                      let currentDir = dirHandle;
                      while (path.length > 1) {
                        currentDir = await currentDir.getDirectoryHandle(
                          path.shift(),
                          {
                            create: true,
                          },
                        );
                      }

                      var newFileHandle;
                      try {
                        newFileHandle = await currentDir.getFileHandle(path, {
                          create: true,
                        });
                      } catch (e) {
                        const errorMSG = document.createElement("div");
                        const error = document.createTextNode(e);
                        errorMSG.appendChild(error);
                        errorMSG.style.color = "red";
                        versions.appendChild(errorMSG);
                        continue;
                      }
                      const writable = await newFileHandle.createWritable();

                      let numSegments = files[key].segments.length;

                      if (numSegments > 0) {
                        let segmentIndex = 0;
                        for (const segment of files[key].segments) {
                          segmentIndex++;
                          console.log(segmentIndex);
                          const response = await fetch(
                            getSegmentURI(binary_id, segment[1]),
                          );
                          await response
                            .arrayBuffer()
                            .then(async function (arrayBuffer) {
                              const inflate = new Zlib.Inflate(
                                new Uint8Array(arrayBuffer),
                              );
                              let inflated = inflate.decompress();
                              await writable.write(inflated);
                              console.log(segment[2]);
                              currentSize += segment[2];
                              progressIndicator.style.width =
                                (currentSize / totalSize) * 100 + "%";
                            });
                        }
                      }
                      await writable.close();
                    }

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
              })
              .catch();
          } else {
            console.info("Probably a mobile build (or not purchased)");
            if (obb_id != null) {
              openURI(getDownloadURI(obb_id), true);
            }
            const requestData = `access_token=${access_token}&doc=query ($params: AppBinaryInfoArgs!) { app_binary_info(args: $params) { info { binary { ... on AndroidBinary { id package_name version_code asset_files { edges { node { ... on AssetFile {  file_name uri size  } } } } } } } }}&variables={\"params\":{\"app_params\":[{\"app_id\":\"${applicationID}\",\"version_code\":\"${version_code}\"}]}}`;
            createAndSendRequest(requestData)
              .then((response) => {
                const binary = response.data.app_binary_info.info[0].binary;
                if (binary != null) {
                  const edges = binary.asset_files.edges;
                  if (edges.length < 1) {
                    openURI(getDownloadURI(binary_id), true);
                  } else {
                    openURI(getDownloadURI(binary.id), true);
                    for (const edge of edges) {
                      openURI(edge.node.uri, false);
                    }
                  }
                } else {
                  openURI(getDownloadURI(binary_id), true);
                }
              })
              .catch();
          }
        })
        .catch();
    } else {
      const customContent = function (header, versions) {
        const headerText1 = document.createTextNode(
          "No oculus.com login found, please log into ",
        );
        const headerText2 = document.createTextNode("secure.oculus.com");
        const headerText3 = document.createTextNode(" and try again");
        const a = document.createElement("a");
        a.classList.add("_annb", "_anmo");
        a.href = "https://secure.oculus.com";
        a.target = "_blank";
        a.appendChild(headerText2);
        header.appendChild(headerText1);
        header.appendChild(a);
        header.appendChild(headerText3);
      };

      showModal("No access_token found", customContent);
    }
  });
}

async function openURI(uri, important) {
  try {
    const response = await fetch(uri, {
      method: "HEAD",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      credentials: "include",
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
            "It seems like DownQuest wasn't able to generate all required download links. This is most likely the case because you don't own the game or have been logged out.",
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
