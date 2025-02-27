chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_STATUS") {
    chrome.action.setBadgeText({ text: message.status });
  } else if (message.type === "RELOAD_PAGE") {
    chrome.tabs.reload(sender.tab.id);
  }
});
