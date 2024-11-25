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
