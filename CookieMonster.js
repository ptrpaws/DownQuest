chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message == "Me want cookie!") {
    getCookies("https://www.oculus.com", "oc_ac_at", sendResponse);
    return true;
  }
});

function getCookies(domain, name, callback) {
  chrome.cookies.get({ url: domain, name: name }, function (cookie) {
    callback(cookie ? cookie.value : null);
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.tabs.sendMessage(
      tabId,
      {
        message: "urlChanged",
        url: changeInfo.url,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "Could not send message to content script:",
            chrome.runtime.lastError.message,
          );
        } else {
          console.log("Message sent successfully:", response);
        }
      },
    );
  }
});
