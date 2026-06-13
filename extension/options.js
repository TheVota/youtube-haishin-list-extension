const form = document.querySelector("#streamerForm");
const nameInput = document.querySelector("#nameInput");
const urlInput = document.querySelector("#urlInput");
const streamerList = document.querySelector("#streamerList");
const streamerCount = document.querySelector("#streamerCount");
const status = document.querySelector("#status");

let streamers = [];

init();

async function init() {
  streamers = await getStoredStreamers();
  renderStreamers();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addStreamer();
  });
}

async function addStreamer() {
  const target = normalizeYouTubeTarget(urlInput.value);
  if (!target) {
    showStatus("YouTube チャンネル URL、チャンネル ID、または @handle を入力してください。", true);
    urlInput.focus();
    return;
  }

  if (streamers.some((streamer) => streamer.key === target.key)) {
    showStatus("このチャンネルはすでに追加されています。", true);
    return;
  }

  streamers.push({
    id: createStreamerId(),
    name: nameInput.value.trim() || target.key,
    url: target.url,
    streamsUrl: target.streamsUrl,
    key: target.key
  });

  nameInput.value = "";
  urlInput.value = "";
  await save();
  renderStreamers();
}

function renderStreamers() {
  streamerList.replaceChildren();
  streamerCount.textContent = `${streamers.length}件`;

  if (!streamers.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "まだ配信者が追加されていません。";
    streamerList.append(empty);
    return;
  }

  streamers.forEach((streamer) => {
    const item = document.createElement("article");
    item.className = "streamer-item";

    const body = document.createElement("div");
    body.className = "streamer-body";

    const name = document.createElement("input");
    name.type = "text";
    name.value = streamer.name;
    name.setAttribute("aria-label", "表示名");
    name.addEventListener("change", async () => {
      streamer.name = name.value.trim() || streamer.key;
      await save();
      renderStreamers();
    });

    const link = document.createElement("a");
    link.href = streamer.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = streamer.url;

    body.append(name, link);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "削除";
    remove.addEventListener("click", async () => {
      streamers = streamers.filter((item) => item.id !== streamer.id);
      await save();
      renderStreamers();
    });

    item.append(body, remove);
    streamerList.append(item);
  });
}

async function save() {
  streamers = sanitizeStreamers(streamers);
  await chrome.storage.local.set({ [STREAMERS_STORAGE_KEY]: streamers });
  showStatus("保存しました");
}

function showStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle("is-error", isError);
}
