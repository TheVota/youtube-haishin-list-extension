importScripts("shared.js");

const REFRESH_ALARM = "refresh-live-count";
const REFRESH_MINUTES = 3;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  refreshLiveBadge();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  refreshLiveBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshLiveBadge();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SET_LIVE_BADGE") {
    setBadge(Number(message.count) || 0);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STREAMERS_STORAGE_KEY]) {
    refreshLiveBadge();
  }
});

async function refreshLiveBadge() {
  try {
    const streamers = await getStoredStreamers();
    if (!streamers.length) {
      setBadge(0);
      return;
    }

    const results = await Promise.allSettled(streamers.map(countStreamerLiveStreams));
    const count = results.reduce((total, result) => total + (result.status === "fulfilled" ? result.value : 0), 0);
    setBadge(count);
  } catch (error) {
    console.error(error);
    setBadge(null);
  }
}

async function countStreamerLiveStreams(streamer) {
  const response = await fetch(streamer.streamsUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`${streamer.streamsUrl}: ${response.status}`);

  const html = await response.text();
  const data = extractInitialData(html);
  const renderers = findStreamRenderers(data);
  const liveIds = new Set();

  renderers.forEach((renderer) => {
    const videoId = getRendererVideoId(renderer);
    if (videoId && isLiveRenderer(renderer) && !isFreeChatRenderer(renderer, streamer)) {
      liveIds.add(videoId);
    }
  });

  return liveIds.size;
}

function extractInitialData(html) {
  const match = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) throw new Error("ytInitialData not found");
  return JSON.parse(match[1]);
}

function findStreamRenderers(root) {
  const renderers = [];
  const stack = [root];

  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;

    if (value.videoRenderer?.videoId) {
      renderers.push(value.videoRenderer);
      continue;
    }

    if (value.lockupViewModel?.contentId || value.lockupViewModel?.rendererContext?.commandContext) {
      renderers.push(value.lockupViewModel);
      continue;
    }

    if (Array.isArray(value)) {
      stack.push(...value);
    } else {
      stack.push(...Object.values(value));
    }
  }

  return renderers;
}

function isLiveRenderer(renderer) {
  if (renderer.contentId || renderer.rendererContext?.commandContext) {
    return /live|ライブ配信中|配信中|watching|視聴中/i.test(getLockupStatusText(renderer));
  }

  return Boolean(renderer.badges?.some((badge) => {
    const style = badge.metadataBadgeRenderer?.style || "";
    const label = badge.metadataBadgeRenderer?.label || "";
    return style.includes("LIVE") || /live|配信中/i.test(label);
  })) || getText(renderer.thumbnailOverlays).match(/live|配信中/i);
}

function getRendererVideoId(renderer) {
  return renderer.videoId || renderer.contentId || renderer.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId || "";
}

function getLockupStatusText(lockup) {
  const rows = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
  const metadataText = rows
    .flatMap((row) => row.metadataParts || [])
    .map((part) => part.text?.content || part.accessibilityLabel || getText(part.text))
    .filter(Boolean)
    .join(" ");
  const badgeText = (lockup.contentImage?.thumbnailViewModel?.overlays || [])
    .flatMap((overlay) => overlay.thumbnailBottomOverlayViewModel?.badges || [])
    .map((badge) => getText(badge.thumbnailBadgeViewModel))
    .filter(Boolean)
    .join(" ");

  return [metadataText, badgeText].filter(Boolean).join(" ");
}

function isFreeChatRenderer(renderer, streamer) {
  return /free\s*chat|フリー\s*チャット|フリチャ/i.test(`${getText(renderer.title)} ${streamer.name}`);
}

function getText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(getText).filter(Boolean).join(" ");
  if (value.simpleText) return value.simpleText;
  if (value.text) return value.text;
  if (value.runs) return value.runs.map(getText).filter(Boolean).join("");
  if (typeof value === "object") return Object.values(value).map(getText).filter(Boolean).join(" ");
  return "";
}

function setBadge(count) {
  chrome.action.setBadgeBackgroundColor({ color: "#4f8cff" });
  chrome.action.setBadgeTextColor?.({ color: "#FFFFFF" });
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setTitle({
    title: count === null ? "YouTube Live List" : `YouTube Live List - 配信中 ${count}件`
  });
}
