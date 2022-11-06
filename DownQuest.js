const pathname = window.location.pathname.split('/').filter(item => item);;

const applicationID = pathname[2];

let access_token = "";

let DLCs = [];

window.addEventListener("load", main, false);

function main() {
    injectStyle();
    chrome.runtime.sendMessage("Me want cookie!", (response) => {
        access_token = response;
        let jsInitChecktimer = setInterval(checkForJS_Finish, 5);

        function checkForJS_Finish() {
            if (pathname.length == 3) {
                if (document.getElementsByClassName("app__info").length >= 1) {
                    clearInterval(jsInitChecktimer);

                    injectButtons();

                    if (document.getElementsByClassName("app-downloadable-content-section__items").length >= 1) {
                        createDLCButtons();
                    }
                }
            } else {
                clearInterval(jsInitChecktimer);
            }
        }
    })
}



function injectStyle() {
    const styles = `.button--green { background-color: #00a400 }
    .button--green:hover,.button--green:focus { background-color: #05B305 }
    .button--green:active { background-color: #1CE61C }`

    const css = document.createElement('style');
    css.type = 'text/css';
    css.innerHTML = styles;
    document.head.appendChild(css);
}


function createDLCButtons() {
    const requestData = `access_token=${access_token}&variables={"id":"${applicationID}", "first": 10000, "last": null, "after": null, "before": null, "forward": true}&doc_id=3853229151363174`;
    createAndSendRequest(requestData).then((response) => {
        response.data.node.latest_supported_binary.firstIapItems.edges.forEach(function (edge) {
            if (edge.node.latest_supported_asset_file != undefined) {
                DLCs.push(["asset", edge.node.id, edge.node.display_name, edge.node.latest_supported_asset_file.id]);
            } else if (edge.node.bundle_items != undefined) {
                let bundle = [];
                edge.node.bundle_items.edges.forEach(function (edge) {
                    bundle.push(edge.node.id);
                });
                DLCs.push(["bundle", edge.node.id, edge.node.display_name, bundle]);
            } else {
                DLCs.push([null, edge.node.id, edge.node.display_name]);
            }
        });

        const DLCItems = document.getElementsByClassName("app-downloadable-content-item");
        for (let i = 0; i < DLCItems.length; i++) {
            injectDLCButton(i, DLCs[i]);
        }

        DLCObserver.observe(document.getElementsByClassName("app-downloadable-content-section__items")[0], {
            subtree: false,
            childList: true
        });

    }).catch(error => {
        console.error(error);
    })
}



function getDLCPage() {
    return parseInt(document.getElementsByClassName("app-review-pager__number--current")[0].innerText) - 1;
}



const DLCObserver = new MutationObserver(function (mutations_list) {
    let i = 0;
    mutations_list.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (added_node) {
            injectDLCButton(i, DLCs[i + getDLCPage() * 5])
            i++;
        });
    });
});




function injectDLCButton(i, DLC) {
    const anchor = document.getElementsByClassName("app-downloadable-content-item__right")[i];
    const button = document.createElement('button');
    anchor.style.gridRowGap = "8px";
    button.classList.add('button--height-tall');
    button.classList.add('button--green');
    button.classList.add('button');
    if (DLC[0] == "asset") {
        button.addEventListener("click", function () {
            downloadBuild(DLC[3])
        })
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
                    })
                });
            };
            showModal("Download DLC from bundle!", customContent);
        })
    } else {
        button.classList.add('button--disabled');
    }

    const span = document.createElement('span');
    span.classList.add('app-purchase-price');
    button.appendChild(span);
    const text = document.createTextNode("Download");
    span.appendChild(text);

    anchor.append(button);
}



function injectButtons() {
    const anchors = document.getElementsByClassName("app-purchase__purchase-button");

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
    }

    for (let i = 0; i < anchors.length; i++) {
        const button = document.createElement('button');
        anchors[i].style.gridRowGap = "8px";
        anchors[i].style.display = "grid";
        button.addEventListener("click", function () {
            showModal("Downgrade this app!", modalContent);
        });
        button.classList.add('button--height-tall');
        button.classList.add('button--green');
        button.classList.add('button');

        const span = document.createElement('span');
        span.classList.add('app-purchase-price');

        const text = document.createTextNode("Downgrade");
        button.appendChild(text);

        anchors[i].append(button);
    }
}



function showModal(titleString, customContent, closeable = true) {
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = "17px";

    const closeModal = function closeModal() {
        document.body.style.overflow = null;
        document.body.style.paddingRight = null;
        root.remove();
    }

    const root = document.createElement("div");
    root.classList.add("sky-modal__root");
    document.body.appendChild(root);

    const backdrop = document.createElement("div");
    backdrop.classList.add("sky-modal__backdrop");
    if (closeable) {
        backdrop.addEventListener("click", closeModal);
    }
    root.appendChild(backdrop);

    const modal = document.createElement("div");
    modal.classList.add("sky-modal");
    root.appendChild(modal);

    const title = document.createElement("div");
    title.classList.add("sky-modal__title");
    modal.appendChild(title);

    const titleName = document.createElement("div");
    titleName.classList.add("sky-modal__title-name");
    title.appendChild(titleName);

    const titleText = document.createTextNode(titleString);
    titleName.appendChild(titleText);


    const titleClose = document.createElement("div");
    titleClose.classList.add("sky-modal__title-close");
    title.appendChild(titleClose);

    if (closeable) {
        const titleCloseIcon = document.createElement("i");
        titleCloseIcon.classList.add("sky-modal__title-close-icon");
        titleCloseIcon.classList.add("bxIcon48");
        titleCloseIcon.classList.add("bxIcon48--close");
        titleCloseIcon.addEventListener("click", closeModal);
        titleClose.appendChild(titleCloseIcon);
    }

    const content = document.createElement("div");
    content.classList.add("sky-modal__content");
    modal.appendChild(content);

    const header = document.createElement("div");
    header.classList.add("app-details-supported-modes-modal__header");
    content.appendChild(header);

    const versions = document.createElement("div");
    content.appendChild(versions);

    customContent(header, versions, closeModal);
}



function createChannelDropdownToggle(parent, versions) {
    let items = [];

    const requestData = `access_token=${access_token}&variables={"applicationID":"${applicationID}"}&doc_id=3828663700542720`;
    createAndSendRequest(requestData).then((response) => {
        response.data.node.release_channels.nodes.forEach(function (node) {
            items.push([node.id, node.channel_name]);
        });

        const selected = 0;
        createDropdownToggle(parent, items, selected, function _action(index) {
            createVersions(versions, items[index][0]);
        });
        createVersions(versions, items[selected][0]);
    }).catch(error => {
        console.error(error);
    })
}



function createDropdownToggle(parent, items, selected, action) {
    const dropdownToggle = document.createElement("a");
    dropdownToggle.classList.add("sky-dropdown__toggle");
    dropdownToggle.classList.add("link--clickable");
    dropdownToggle.href = "#";
    dropdownToggle.addEventListener("click", function _destroy() {
        createDropdown(dropdownToggle, items, selected, action, function () {
            dropdownToggle.removeEventListener("click", _destroy, false)
        })
    });
    parent.appendChild(dropdownToggle);

    const toggleStatus = document.createElement("span");
    toggleStatus.classList.add("sky-dropdown__toggle__status");
    dropdownToggle.appendChild(toggleStatus);

    toggleStatus.appendChild(document.createTextNode("(" + items[selected][1] + ")"));

    //if (items.length > 1) {
    const toggleCaret = document.createElement("i");
    toggleCaret.classList.add("bxIcon24");
    toggleCaret.classList.add("bxIcon24--caretDown");
    toggleCaret.classList.add("sky-dropdown__toggle__caret");
    dropdownToggle.appendChild(toggleCaret);
    //}
}



function createDropdown(dropdownToggle, items, selected, action, destroy) {
    const bottom = document.createElement("div");
    bottom.classList.add("sky-dropdown__bottom");
    bottom.classList.add("sky-dropdown");
    const rect = dropdownToggle.getBoundingClientRect();
    bottom.style.left = (rect.left + window.pageXOffset - 125.406) + "px";
    bottom.style.top = (rect.top + window.pageYOffset + 24) + "px";
    document.body.appendChild(bottom);

    const list = document.createElement("ul");
    list.classList.add("sky-dropdown__list");
    list.classList.add("sky-dropdown__list--large");
    list.classList.add("sky-dropdown__list--bottom");
    bottom.appendChild(list);

    items.forEach(function (val, index) {
        const item = document.createElement("li");
        item.classList.add("sky-dropdown__item");
        if (index == selected) {
            item.classList.add("sky-dropdown__item--selected");
        }

        list.appendChild(item);

        const link = document.createElement("a");
        link.classList.add("sky-dropdown__link");
        link.classList.add("link--clickable");
        link.addEventListener("click", function _func() {
            switchDropdown(dropdownToggle, items, index, action, destroy)
        });
        link.href = "#";
        link.appendChild(document.createTextNode(val[1]));
        item.appendChild(link);
    });
    document.body.addEventListener("click", function _func() {
        closeDropdown(bottom)
    }, true);
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
            dropdownToggle.removeEventListener("click", _destroy, false)
        })
    });
}



function createAndSendRequest(sendArgs) {
    return new Promise((resolve, reject) => {
        const transport = new XMLHttpRequest;
        const graphURI = "https://graph.oculus.com/graphql";
        transport.withCredentials = true;
        transport.open("POST", graphURI, true);
        transport.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        transport.onreadystatechange = function () {
            if (transport.readyState === 4) {
                if (transport.status == 200) {
                    resolve(JSON.parse(transport.responseText));
                } else {
                    reject(transport.status);
                }
            }
        }
        transport.send(sendArgs);
    })
}



function createVersions(versions, releaseChannelID) {
    while (versions.firstChild) {
        versions.removeChild(versions.firstChild);
    }

    const spinner = document.createElement("div");
    spinner.classList.add("fading-spinner");
    spinner.classList.add("fading-spinner--loaded");
    spinner.classList.add("app-details-supported-modes-modal__row");
    versions.appendChild(spinner);
    const animation = document.createElement("i");
    animation.classList.add("sky-spinner");
    animation.classList.add("sky-spinner--large");
    animation.style.position = "absolute";
    animation.style.left = "50%";
    animation.style.marginLeft = "-24px";
    spinner.appendChild(animation);

    const requestData = `access_token=${access_token}&variables={"releaseChannelID":"${releaseChannelID}"}&doc_id=3973666182694273`;

    createAndSendRequest(requestData).then((response) => {
        spinner.remove();
        let version_list = response.data.node.binaries.edges;
        for (const val of version_list) {
            createVersion(versions, val.node.version, val.node.change_log, val.node.id, val.node.obb_binary, val.node.version_code);
        }
    }).catch(error => {
        console.error(error);
    })
}



function createVersion(versions, version, text, id, obb, version_code) {
    const row = document.createElement("div");
    row.classList.add("app-details-supported-modes-modal__row");
    versions.appendChild(row);

    const description = document.createElement("a");
    description.classList.add("link--clickable");
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
    return `https://securecdn.oculus.com/binaries/download/?access_token=${access_token}&id=${id}&get_manifest=1`
}

function getDownloadURI(id) {
    return `https://securecdn.oculus.com/binaries/download/?id=${id}`
}

function getSegmentURI(binary_id, segment_sha256) {
    return `https://securecdn.oculus.com/binaries/segment/?access_token=${access_token}&binary_id=${binary_id}&segment_sha256=${segment_sha256}`
}



function createProgressIndicator(parent) {
    const progressIndicatorBackground = document.createElement("div");
    progressIndicatorBackground.classList.add("app-ratings-histogram__bar__bg");
    parent.appendChild(progressIndicatorBackground);

    const progressIndicator = document.createElement("div");
    progressIndicator.classList.add("app-ratings-histogram__bar__fg");
    progressIndicatorBackground.appendChild(progressIndicator);

    parent.appendChild(progressIndicatorBackground);

    return progressIndicator;
}



async function downloadBuild(binary_id, version_code, obb_id) {
    fetch(getManifestURI(binary_id))
        .then(function (response) {
            if (response.status == 200) {
                response.arrayBuffer()
                    .then(async function (arrayBuffer) {
                        const unzip = new Zlib.Unzip(new Uint8Array(arrayBuffer));
                        const manifest = unzip.decompress("manifest.json");

                        const manifestJSON = JSON.parse(new TextDecoder().decode(manifest));
                        const files = manifestJSON.files;

                        window.onbeforeunload = function () {
                            return "You are about to leave this page. Your download will not complete.";
                        }

                        const customContent = async function customContent(header, versions, closeModal) {
                            const headerText1 = document.createTextNode("Currently downloading: ");
                            const headerText2 = document.createTextNode(manifestJSON.canonicalName);
                            const b = document.createElement("b");
                            b.appendChild(headerText2);
                            header.appendChild(headerText1);
                            header.appendChild(b);

                            try {
                                const fileIndicator = createProgressIndicator(versions);
                                const segmentIndicator = createProgressIndicator(versions);
                                let dirHandle;
                                try {
                                    dirHandle = await self.showDirectoryPicker({
                                        startIn: 'downloads'
                                    });
                                    while (await dirHandle.queryPermission({
                                            mode: "readwrite"
                                        }) !== 'granted') {
                                        await dirHandle.requestPermission({
                                            mode: "readwrite"
                                        })
                                    };
                                } catch (e) {
                                    closeModal();
                                    return;
                                }

                                let i = 0;
                                while (true) {
                                    let directoryName;
                                    if (i == 0) {
                                        directoryName = manifestJSON.canonicalName;
                                    } else {
                                        directoryName = `${manifestJSON.canonicalName} (${i})`;
                                    }
                                    try {
                                        await dirHandle.getDirectoryHandle(directoryName);
                                    } catch {
                                        dirHandle = await dirHandle.getDirectoryHandle(directoryName, {
                                            create: true,
                                        });
                                        break;
                                    }
                                    i++;
                                }

                                const numFiles = Object.keys(files).length;
                                i = 0;
                                for await (const key of Object.keys(files)) {
                                    i++;
                                    console.log(key);
                                    console.log("segments: " + files[key].segments.length);
                                    console.log("size: " + files[key].size);

                                    let path = key.split(/\\|\//);
                                    let currentDir = dirHandle;
                                    while (path.length > 1) {
                                        currentDir = await currentDir.getDirectoryHandle(path.shift(), {
                                            create: true,
                                        });
                                    }

                                    var newFileHandle;
                                    try {
                                        newFileHandle = await currentDir.getFileHandle(path, {
                                            create: true
                                        });
                                    } catch (e) {
                                        const errorMSG = document.createElement("div");
                                        const error = document.createTextNode(e)
                                        errorMSG.appendChild(error);
                                        errorMSG.style.color = "red";
                                        versions.appendChild(errorMSG);
                                        continue;
                                    }
                                    const writable = await newFileHandle.createWritable();

                                    let numSegments = files[key].segments.length;

                                    segmentIndicator.style.width = 0;
                                    if (numSegments > 0) {
                                        let segmentIndex = 0;
                                        for (const segment of files[key].segments) {
                                            segmentIndex++;
                                            console.log(segmentIndex);
                                            const response = await fetch(getSegmentURI(binary_id, segment[1]))
                                            await response.arrayBuffer()
                                                .then(async function (arrayBuffer) {
                                                    const inflate = new Zlib.Inflate(new Uint8Array(arrayBuffer));
                                                    let inflated = inflate.decompress();
                                                    await writable.write(inflated);
                                                    segmentIndicator.style.width = ((segmentIndex / numSegments * 100) + "%");
                                                });
                                        }
                                    }
                                    await writable.close();
                                    fileIndicator.style.width = ((i / numFiles * 100) + "%");
                                };

                                closeModal();
                            } catch (e) {
                                console.error(e);
                                const errorMSG = document.createElement("div");
                                const error = document.createTextNode(e)
                                errorMSG.appendChild(error);
                                errorMSG.style.color = "red";
                                versions.appendChild(errorMSG);
                            }
                        }
                        showModal("Downloading...", customContent, false);
                    })
                    .catch();
            } else {
                console.info("Probably a mobile build (or not purchased)")
                if (obb_id != null) {
                    openURI(getDownloadURI(obb_id), true);
                }
                const requestData = `access_token=${access_token}&doc=query ($params: AppBinaryInfoArgs!) { app_binary_info(args: $params) { info { binary { ... on AndroidBinary { id package_name version_code asset_files { edges { node { ... on AssetFile {  file_name uri size  } } } } } } } }}&variables={\"params\":{\"app_params\":[{\"app_id\":\"${applicationID}\",\"version_code\":\"${version_code}\"}]}}`
                createAndSendRequest(requestData).then((response) => {
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
                }).catch();
            }
        })
        .catch();
}



function openURI(uri, important) {
    const transport = new XMLHttpRequest;
    transport.withCredentials = true;
    transport.open("HEAD", uri, true);
    transport.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    transport.onreadystatechange = function () {
        if (transport.readyState === 4) {
            if (transport.status == 200) {
                window.open(uri, "_blank");
            } else {
                console.info("Couldn't access " + uri + " because you probably havn't purchased it");
                if (important) {
                    customContent = function (header, versions) {
                        const headerText = document.createTextNode("It seems like DownQuest wasn't able to generate all required download links. This is most likely the case because you don't own the game or have been logged out.");
                        header.appendChild(headerText);
                    }
                    showModal("Info", customContent);
                }
            }
        }
    }
    transport.send();
}