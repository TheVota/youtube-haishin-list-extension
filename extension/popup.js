const state = {
  view: "live",
  live: [],
  scheduled: [],
  streamers: [],
  loading: false
};

const list = document.querySelector("#streamList");
const message = document.querySelector("#message");
const updatedAt = document.querySelector("#updatedAt");
const refreshButton = document.querySelector("#refreshButton");
const optionsButton = document.querySelector("#optionsButton");
const tabs = [...document.querySelectorAll(".tab")];

refreshButton.addEventListener("click", () => refresh());
optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.view = tab.dataset.view;
    tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    render();
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STREAMERS_STORAGE_KEY]) {
    refresh();
  }
});

refresh();

async function refresh() {
  setLoading(true);

  try {
    state.streamers = await getStoredStreamers();
    if (!state.streamers.length) {
      state.live = [];
      state.scheduled = [];
      updateActionBadge(0);
      updatedAt.textContent = "配信者が未設定";
      render();
      return;
    }

    const results = await Promise.allSettled(state.streamers.map(fetchStreamerStreams));
    const streams = results
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value);

    state.live = sortStreams(uniqueStreams(streams.filter((item) => item.isLive)));
    state.scheduled = sortStreams(uniqueStreams(streams.filter((item) => !item.isLive))).slice(0, 30);
    updateActionBadge(state.live.length);
    updatedAt.textContent = `${new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date())} 更新`;
    render();
  } catch (error) {
    showMessage("取得に失敗しました。時間をおいて更新してください。");
    console.error(error);
  } finally {
    setLoading(false);
  }
}

async function fetchStreamerStreams(streamer) {
  const html = await fetchText(streamer.streamsUrl);
  const data = extractInitialData(html);
  const renderers = findStreamRenderers(data);
  const channelName = getChannelName(data) || streamer.name;
  const resolvedStreamer = { ...streamer, name: channelName };

  const items = renderers
    .map((renderer) => createStreamItem(renderer, resolvedStreamer))
    .filter(Boolean)
    .filter((item) => !isFreeChat(item));

  return Promise.all(items.map(enrichLiveStreamTiming));
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  return response.text();
}

function extractInitialData(html) {
  const match = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) throw new Error("ytInitialData not found");
  return JSON.parse(match[1]);
}

function extractInitialPlayerResponse(html) {
  const markerIndex = html.indexOf("ytInitialPlayerResponse");
  if (markerIndex < 0) return null;

  const start = html.indexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(start, index + 1));
      }
    }
  }

  return null;
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

function getChannelName(root) {
  const stack = [root];

  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;

    const title = value.channelMetadataRenderer?.title || value.pageHeaderRenderer?.pageTitle;
    if (title) return clean(title);

    if (Array.isArray(value)) {
      stack.push(...value);
    } else {
      stack.push(...Object.values(value));
    }
  }

  return "";
}

function createStreamItem(renderer, streamer) {
  if (renderer.contentId || renderer.rendererContext?.commandContext) {
    return createLockupStreamItem(renderer, streamer);
  }

  const videoId = renderer.videoId;
  if (!videoId) return null;

  const title = getText(renderer.title) || "Untitled";
  const isLive = isLiveRenderer(renderer);
  const isScheduled = Boolean(renderer.upcomingEventData) || hasBadge(renderer, "UPCOMING") || hasBadge(renderer, "予定");
  if (!isLive && !isScheduled) return null;

  const startsAt = Number(renderer.upcomingEventData?.startTime || 0) * 1000 || null;
  const metaParts = [
    getText(renderer.shortViewCountText),
    startsAt ? formatRelativeTime(new Date(startsAt)) : getText(renderer.publishedTimeText)
  ].filter(Boolean);

  return {
    id: videoId,
    channelId: streamer.key,
    platform: "youtube",
    isLive,
    startsAt,
    title: clean(title),
    member: streamer.name,
    thumbnail: getBestThumbnail(renderer.thumbnail) || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    meta: clean(metaParts.join(" / ")),
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

function createLockupStreamItem(lockup, streamer) {
  const videoId = lockup.contentId || lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
  if (!videoId) return null;

  const statusText = getLockupStatusText(lockup);
  const isLive = /live|ライブ配信中|配信中|watching|視聴中/i.test(statusText);
  const isScheduled = /upcoming|scheduled|premiere|予定|待機中/i.test(statusText);
  if (!isLive && !isScheduled) return null;

  const title = lockup.metadata?.lockupMetadataViewModel?.title?.content || getText(lockup.metadata?.lockupMetadataViewModel?.title) || "Untitled";
  const elapsedMs = isLive ? parseLiveDurationMs(statusText) : null;
  const startsAt = elapsedMs ? Date.now() - elapsedMs : parseScheduledStartTime(statusText);
  const meta = isLive
    ? [getLiveViewerText(statusText), elapsedMs ? formatElapsed(elapsedMs) : ""].filter(Boolean).join(" / ")
    : getLockupMetadata(lockup);

  return {
    id: videoId,
    channelId: streamer.key,
    platform: "youtube",
    isLive,
    startsAt,
    title: clean(title),
    member: streamer.name,
    thumbnail: getBestSource(lockup.contentImage?.thumbnailViewModel?.image) || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    meta: clean(meta),
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

async function enrichLiveStreamTiming(item) {
  if (!item.isLive || item.startsAt) return item;

  try {
    const startsAt = await fetchLiveStartTime(item.id);
    if (!startsAt) return item;

    return {
      ...item,
      startsAt,
      meta: formatLiveMeta(item.meta, startsAt)
    };
  } catch (error) {
    console.warn(`Failed to fetch live start time for ${item.id}`, error);
    return item;
  }
}

async function fetchLiveStartTime(videoId) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
  const playerResponse = extractInitialPlayerResponse(html);
  const startTimestamp = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp;
  if (!startTimestamp) return null;

  const startsAt = new Date(startTimestamp).getTime();
  return Number.isNaN(startsAt) ? null : startsAt;
}

function formatLiveMeta(meta, startsAt) {
  const viewerText = getLiveViewerText(meta);
  const elapsedText = formatElapsed(Date.now() - startsAt);
  return [viewerText, elapsedText].filter(Boolean).join(" / ");
}

function isLiveRenderer(renderer) {
  return Boolean(renderer.badges?.some((badge) => {
    const style = badge.metadataBadgeRenderer?.style || "";
    const label = badge.metadataBadgeRenderer?.label || "";
    return style.includes("LIVE") || /live|配信中/i.test(label);
  })) || getText(renderer.thumbnailOverlays).match(/live|配信中/i);
}

function hasBadge(renderer, text) {
  const pattern = new RegExp(text, "i");
  return JSON.stringify(renderer.badges || []).match(pattern);
}

function getBestThumbnail(thumbnail) {
  const thumbnails = thumbnail?.thumbnails || [];
  return thumbnails[thumbnails.length - 1]?.url || "";
}

function getBestSource(image) {
  const sources = image?.sources || [];
  return sources[sources.length - 1]?.url || "";
}

function getLockupMetadata(lockup) {
  const rows = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
  return rows
    .flatMap((row) => row.metadataParts || [])
    .map((part) => part.text?.content || part.accessibilityLabel || getText(part.text))
    .filter(Boolean)
    .join(" / ");
}

function getLockupStatusText(lockup) {
  const badgeText = (lockup.contentImage?.thumbnailViewModel?.overlays || [])
    .flatMap((overlay) => overlay.thumbnailBottomOverlayViewModel?.badges || [])
    .map((badge) => getText(badge.thumbnailBadgeViewModel))
    .filter(Boolean)
    .join(" ");

  return [getLockupMetadata(lockup), badgeText].filter(Boolean).join(" ");
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

function uniqueStreams(streams) {
  const seen = new Set();
  return streams.filter((stream) => {
    if (seen.has(stream.id)) return false;
    seen.add(stream.id);
    return true;
  });
}

function sortStreams(streams) {
  return [...streams].sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    if (a.isLive) return (b.startsAt || 0) - (a.startsAt || 0);
    return (a.startsAt || Number.MAX_SAFE_INTEGER) - (b.startsAt || Number.MAX_SAFE_INTEGER);
  });
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatRelativeTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "";

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  const absMinutes = Math.abs(diffMinutes);
  const suffix = diffMinutes >= 0 ? "前" : "後";

  if (absMinutes < 1) return diffMinutes >= 0 ? "ただいま開始" : "まもなく";
  if (absMinutes < 60) return `${absMinutes}分${suffix}`;

  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours}時間${minutes}分${suffix}` : `${hours}時間${suffix}`;
  }

  const days = Math.floor(hours / 24);
  return `${days}日${suffix}`;
}

function formatElapsed(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  if (totalMinutes < 1) return "たった今";
  if (totalMinutes < 60) return `${totalMinutes}分前`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours}時間${minutes}分前` : `${hours}時間前`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}日${restHours}時間前` : `${days}日前`;
}

function parseLiveDurationMs(value) {
  const text = String(value || "");
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3] || 0);
  const seconds = match[3] ? (first * 3600) + (second * 60) + third : (first * 60) + second;
  return seconds * 1000;
}

function parseScheduledStartTime(value) {
  const match = String(value || "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

function getLiveViewerText(value) {
  return String(value || "").match(/[\d,.万億]+\s*人が視聴中/)?.[0] || "";
}

function isFreeChat(item) {
  return /free\s*chat|フリー\s*チャット|フリチャ/i.test(`${item.title} ${item.member}`);
}

function render() {
  const items = state[state.view];
  list.replaceChildren();

  if (!state.streamers.length) {
    showMessage("設定画面で YouTube チャンネルを追加してください。");
    return;
  }

  if (!items.length) {
    showMessage(state.view === "live" ? "現在配信中の枠はありません。" : "表示できる予定枠がありません。");
    return;
  }

  message.hidden = true;
  items.forEach((item) => list.appendChild(createCard(item)));
}

function createCard(item) {
  const card = document.createElement("a");
  card.className = "stream-card";
  card.href = item.url;
  card.target = "_blank";
  card.rel = "noreferrer";

  const badgeLabel = item.isLive ? "LIVE" : "予定";
  card.innerHTML = `
    <div class="thumb">
      <img src="${escapeHtml(item.thumbnail)}" alt="">
      <span class="badge ${item.isLive ? "" : "scheduled"}">${badgeLabel}</span>
    </div>
    <div class="stream-body">
      <div class="stream-head">
        <div class="member">${escapeHtml(item.member)}</div>
        <span class="platform youtube">YouTube</span>
      </div>
      <p class="title">${escapeHtml(item.title)}</p>
      <div class="meta">${escapeHtml(item.meta)}</div>
    </div>
  `;

  return card;
}

function updateActionBadge(count) {
  chrome.runtime.sendMessage({ type: "SET_LIVE_BADGE", count }).catch(() => {});
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
  list.replaceChildren();
}

function setLoading(loading) {
  state.loading = loading;
  refreshButton.disabled = loading;
  if (loading) showMessage("読み込み中...");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}
