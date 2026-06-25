chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) {
    chrome.sidePanel.open({ tabId: tab.id });
    soundcloudTabId = tab.id;
  }
});

let soundcloudTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openSidePanel" && sender.tab?.id != null) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
    soundcloudTabId = sender.tab.id;
  }

  if (message.action === "fetchComplete" && sender.tab?.id) {
    soundcloudTabId = sender.tab.id;
  }

  if (message.action === "registerSoundCloudTab" && sender.tab?.id) {
    soundcloudTabId = sender.tab.id;
  }

  if (message.action === "playbackCommand") {
    resolvePlaybackCommand(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message ?? String(error) }));
    return true;
  }

  if (message.action === "playbackState") {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});

function isSoundCloudUrl(url) {
  return !!url && /https:\/\/(.*\.)?soundcloud\.com/i.test(url);
}

async function resolvePlaybackCommand(message) {
  const tabId = await findSoundCloudTabId();
  if (!tabId) {
    return { ok: false, error: "Open a soundcloud.com tab to play tracks." };
  }

  const payload = {
    action: "playbackCommand",
    command: message.command,
    payload: message.payload ?? {},
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, payload);
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
    }
  }

  return {
    ok: false,
    error: "Refresh soundcloud.com (F5) and try again.",
  };
}

async function findSoundCloudTabId() {
  if (soundcloudTabId) {
    try {
      const tab = await chrome.tabs.get(soundcloudTabId);
      if (isSoundCloudUrl(tab.url)) return soundcloudTabId;
    } catch {
      soundcloudTabId = null;
    }
  }

  let tabs = await chrome.tabs.query({ currentWindow: true });
  let scTabs = tabs.filter((t) => isSoundCloudUrl(t.url));

  if (scTabs.length === 0) {
    tabs = await chrome.tabs.query({});
    scTabs = tabs.filter((t) => isSoundCloudUrl(t.url));
  }

  const pick =
    scTabs.find((t) => t.active) ||
    scTabs.find((t) => /\/likes|\/you\/likes|\/you\//i.test(t.url || "")) ||
    scTabs[0];

  if (pick?.id) {
    soundcloudTabId = pick.id;
    return pick.id;
  }

  return null;
}
