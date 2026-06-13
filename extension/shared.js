const STREAMERS_STORAGE_KEY = "youtubeStreamers";

const DEFAULT_STREAMERS = [];

function getDefaultStreamers() {
  return DEFAULT_STREAMERS.map((streamer) => ({ ...streamer }));
}

function createStreamerId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeYouTubeTarget(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  const channelId = input.match(/(?:youtube\.com\/channel\/|^)(UC[\w-]{20,})/)?.[1];
  if (channelId) {
    return {
      key: channelId.toLowerCase(),
      url: `https://www.youtube.com/channel/${channelId}`,
      streamsUrl: `https://www.youtube.com/channel/${channelId}/streams`
    };
  }

  const handle = input.match(/(?:youtube\.com\/)?@([A-Za-z0-9._-]+)/)?.[1] || input.match(/^@?([A-Za-z0-9._-]+)$/)?.[1];
  if (handle) {
    return {
      key: `@${handle.toLowerCase()}`,
      url: `https://www.youtube.com/@${handle}`,
      streamsUrl: `https://www.youtube.com/@${handle}/streams`
    };
  }

  try {
    const url = new URL(input);
    if (!/(\.|^)youtube\.com$/.test(url.hostname)) return null;

    const path = url.pathname.replace(/\/+$/, "");
    const customPath = path.match(/^\/(c|user)\/([^/]+)/)?.[0];
    if (customPath) {
      return {
        key: customPath.toLowerCase(),
        url: `https://www.youtube.com${customPath}`,
        streamsUrl: `https://www.youtube.com${customPath}/streams`
      };
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeStreamers(streamers) {
  if (!Array.isArray(streamers)) return getDefaultStreamers();

  const seen = new Set();
  return streamers
    .map((streamer) => {
      const target = normalizeYouTubeTarget(streamer.url || streamer.channel || streamer.handle || "");
      if (!target || seen.has(target.key)) return null;
      seen.add(target.key);

      return {
        id: streamer.id || createStreamerId(),
        name: String(streamer.name || "").trim() || target.key,
        url: target.url,
        streamsUrl: target.streamsUrl,
        key: target.key
      };
    })
    .filter(Boolean);
}

async function getStoredStreamers() {
  const values = await chrome.storage.local.get({ [STREAMERS_STORAGE_KEY]: getDefaultStreamers() });
  return sanitizeStreamers(values[STREAMERS_STORAGE_KEY]);
}
