(function () {
  const LIKES_URL_RE =
    /api-v2\.soundcloud\.com\/users\/(\d+)\/(track_likes|likes)(?:\/|\?|$)/;

  let fetchRunning = false;
  let playbackPollTimer = null;

  injectBridge();
  injectPlayerBridge();
  createButton();
  registerTab();
  setupPlaybackListeners();
  schedulePendingPlayResume();

  function registerTab() {
    chrome.runtime.sendMessage({ action: "registerSoundCloudTab" }).catch(() => {});
  }

  function setupPlaybackListeners() {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.source !== "sc-hidden-gems-player-bridge") return;
      if (event.data.action === "pendingPlayComplete" && event.data.state) {
        chrome.runtime.sendMessage({ action: "playbackState", state: event.data.state });
      }
    });
  }

  function schedulePendingPlayResume() {
    const run = () => {
      pagePlayerCommand("resumePendingPlay")
        .then((result) => {
          if (result?.state) {
            chrome.runtime.sendMessage({ action: "playbackState", state: result.state });
          }
        })
        .catch(() => {});
    };

    [2000, 4500, 7000].forEach((delay) => {
      if (document.readyState === "complete") {
        setTimeout(run, delay);
      } else {
        window.addEventListener("load", () => setTimeout(run, delay), { once: true });
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "fetchLikes") {
      if (fetchRunning) {
        sendResponse({ ok: false, error: "Fetch already in progress" });
        return;
      }

      fetchRunning = true;
      runLikesFetch()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          chrome.runtime.sendMessage({
            action: "fetchError",
            error: error.message ?? String(error),
          });
          sendResponse({ ok: false, error: error.message ?? String(error) });
        })
        .finally(() => {
          fetchRunning = false;
        });

      return true;
    }

    if (message.action === "playbackCommand") {
      handlePlaybackCommand(message.command, message.payload)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message ?? String(error) }));
      return true;
    }
  });

  function injectBridge() {
    if (document.getElementById("sc-hidden-gems-bridge")) return;
    const script = document.createElement("script");
    script.id = "sc-hidden-gems-bridge";
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.onload = () => script.remove();
    (document.documentElement || document.head).appendChild(script);
  }

  function injectPlayerBridge() {
    const script = document.createElement("script");
    script.src = `${chrome.runtime.getURL("player-bridge.js")}?v=${Date.now()}`;
    script.onload = () => script.remove();
    (document.documentElement || document.head).appendChild(script);
  }

  function pingPlayerBridge() {
    return new Promise((resolve) => {
      const requestId = `ping-${Date.now()}`;
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve(false);
      }, 800);

      function onMessage(event) {
        if (event.source !== window || event.data?.source !== "sc-hidden-gems-player-bridge") return;
        if (event.data.requestId !== requestId || !event.data.pong) return;
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(true);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ source: "sc-hidden-gems", action: "ping", requestId }, "*");
    });
  }

  async function ensurePlayerBridge() {
    let alive = await pingPlayerBridge();
    if (alive) return;

    for (let injectAttempt = 0; injectAttempt < 3; injectAttempt += 1) {
      injectPlayerBridge();
      for (let i = 0; i < 25; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        alive = await pingPlayerBridge();
        if (alive) return;
      }
    }

    throw new Error("SoundCloud player bridge unavailable — refresh soundcloud.com");
  }

  function pagePlayerCommand(action, payload = {}) {
    return ensurePlayerBridge().then(
      () =>
        new Promise((resolve, reject) => {
          const requestId = `sc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const timeoutMs = action === "playTrack" ? 45000 : 20000;
          const timeout = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new Error("SoundCloud player did not respond in time"));
          }, timeoutMs);

          function onMessage(event) {
            if (event.source !== window || event.data?.source !== "sc-hidden-gems-player-bridge") return;
            if (event.data.requestId !== requestId) return;
            clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
            resolve(event.data);
          }

          window.addEventListener("message", onMessage);
          window.postMessage({ source: "sc-hidden-gems", action, requestId, ...payload }, "*");
        })
    );
  }

  async function handlePlaybackCommand(command, payload) {
    await ensurePlayerBridge();

    if (command === "playTrack") {
      const result = await pagePlayerCommand("playTrack", { track: payload.track });
      startPlaybackPolling();
      broadcastPlayerState();
      return result;
    }

    if (command === "togglePlayback") {
      const result = await pagePlayerCommand("togglePlayback");
      broadcastPlayerState();
      return result;
    }

    if (command === "pausePlayback") {
      const result = await pagePlayerCommand("pausePlayback");
      broadcastPlayerState();
      return result;
    }

    if (command === "getPlayerState") {
      const result = await pagePlayerCommand("getPlayerState");
      return { ok: true, state: result.state ?? null };
    }

    if (command === "resumePendingPlay") {
      const result = await pagePlayerCommand("resumePendingPlay");
      return result;
    }

    return { ok: false, error: `Unknown playback command: ${command}` };
  }

  function broadcastPlayerState() {
    pagePlayerCommand("getPlayerState")
      .then((result) => {
        if (result.state) {
          chrome.runtime.sendMessage({ action: "playbackState", state: result.state });
        }
      })
      .catch(() => {});
  }

  function startPlaybackPolling() {
    if (playbackPollTimer) return;
    playbackPollTimer = setInterval(broadcastPlayerState, 2000);
  }

  function createButton() {
    if (document.getElementById("sc-hidden-gems-btn")) return;

    const button = document.createElement("button");
    button.id = "sc-hidden-gems-btn";
    button.type = "button";
    button.textContent = "Hidden Gems";
    button.setAttribute("aria-label", "Open SoundCloud Hidden Gems");

    Object.assign(button.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "2147483646",
      padding: "10px 16px",
      border: "none",
      borderRadius: "999px",
      background: "#ff5500",
      color: "#fff",
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
      fontSize: "13px",
      fontWeight: "700",
      letterSpacing: "0.02em",
      cursor: "pointer",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
      transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
    });

    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-2px)";
      button.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.4)";
      button.style.background = "#ff6a1a";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "";
      button.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.35)";
      button.style.background = "#ff5500";
    });

    button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "openSidePanel" });
    });

    const mount = () => {
      if (!document.body) return;
      if (!document.getElementById("sc-hidden-gems-btn")) {
        document.body.appendChild(button);
      }
    };

    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
  }

  function getPageAuth() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Could not read SoundCloud session from page"));
      }, 8000);

      function onMessage(event) {
        if (event.source !== window || event.data?.source !== "sc-hidden-gems-bridge") {
          return;
        }
        if (event.data.action !== "auth") return;

        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(event.data);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ source: "sc-hidden-gems", action: "getAuth" }, "*");
    });
  }

  function authHeaders(oauth) {
    return {
      Authorization: `OAuth ${oauth}`,
      Accept: "application/json",
    };
  }

  function asNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function readPlaybackCount(track) {
    return asNumber(
      track?.playback_count ??
        track?.public_metrics?.playback_count ??
        track?.metrics?.playback_count
    );
  }

  function readLikesCount(track) {
    return asNumber(
      track?.likes_count ??
        track?.favoritings_count ??
        track?.public_metrics?.likes_count ??
        track?.public_metrics?.favoritings_count
    );
  }

  function extractTrackFromLike(like) {
    if (!like || typeof like !== "object") return null;
    if (like.track && typeof like.track === "object") return like.track;
    if (like.kind === "track" || like.title) return like;
    return null;
  }

  function normalizeFirstPageUrl(url, userId, clientId) {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(
      /\/users\/\d+\/(track_likes|likes)/,
      `/users/${userId}/${parsed.pathname.includes("track_likes") ? "track_likes" : "likes"}`
    );
    parsed.searchParams.set("client_id", clientId);
    parsed.searchParams.set("linked_partitioning", "1");
    if (!parsed.searchParams.has("limit")) {
      parsed.searchParams.set("limit", "200");
    }
    parsed.searchParams.delete("offset");
    parsed.searchParams.delete("cursor");
    return parsed.toString();
  }

  function buildCandidateUrls(userId, clientId) {
    const base = `client_id=${encodeURIComponent(clientId)}&limit=200&linked_partitioning=1`;
    return [
      `https://api-v2.soundcloud.com/users/${userId}/track_likes?${base}`,
      `https://api-v2.soundcloud.com/users/${userId}/likes?${base}`,
    ];
  }

  async function fetchMe(oauth, clientId) {
    const res = await fetch(
      `https://api-v2.soundcloud.com/me?client_id=${encodeURIComponent(clientId)}`,
      { headers: authHeaders(oauth) }
    );
    if (!res.ok) {
      throw new Error(`Could not detect SoundCloud user (HTTP ${res.status})`);
    }
    return res.json();
  }

  async function discoverLikesStartUrl(userId, clientId, oauth, capturedUrl) {
    if (capturedUrl && LIKES_URL_RE.test(capturedUrl)) {
      const startUrl = normalizeFirstPageUrl(capturedUrl, userId, clientId);
      const res = await fetch(startUrl, { headers: authHeaders(oauth) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.collection)) {
          return { startUrl, endpoint: startUrl, firstPage: data };
        }
      }
    }

    for (const candidate of buildCandidateUrls(userId, clientId)) {
      const res = await fetch(candidate, { headers: authHeaders(oauth) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.collection)) {
        return { startUrl: candidate, endpoint: candidate, firstPage: data };
      }
    }

    throw new Error("Could not find SoundCloud likes API endpoint");
  }

  async function fetchAllLikes(startUrl, oauth, firstPage, onProgress) {
    const likes = [];
    let nextUrl = startUrl;

    if (firstPage) {
      likes.push(...(firstPage.collection ?? []));
      nextUrl = firstPage.next_href ?? null;
      onProgress(likes.length, nextUrl ? "loading" : "processing");
    }

    while (nextUrl) {
      const res = await fetch(nextUrl, { headers: authHeaders(oauth) });
      if (!res.ok) {
        throw new Error(`Likes request failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      likes.push(...(data.collection ?? []));
      nextUrl = data.next_href ?? null;
      onProgress(likes.length, nextUrl ? "loading" : "processing");
    }

    return likes;
  }

  function getTrackId(track) {
    if (track?.id != null) return track.id;
    const urn = track?.urn ?? track?.publisher_metadata?.urn;
    if (typeof urn === "string") {
      const match = urn.match(/tracks:(\d+)/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function readMetric(value) {
    if (value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return null;
    return n;
  }

  function readPlayedAt(like) {
    return like?.played_at ?? like?.created_at ?? null;
  }

  function readLabelName(track) {
    const meta = track?.publisher_metadata;
    const candidates = [track?.label_name, meta?.label_name];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function mapLikeEntry(like) {
    const track = extractTrackFromLike(like);
    if (!track) return null;
    const user = track.user && typeof track.user === "object" ? track.user : {};
    return {
      id: getTrackId(track),
      title: track.title ?? "",
      username: user.username ?? "",
      genre: track.genre ?? "",
      tag_list: track.tag_list ?? "",
      label_name: readLabelName(track),
      playback_count: readMetric(readPlaybackCount(track)),
      likes_count: readMetric(readLikesCount(track)),
      followers_count: readMetric(user.followers_count),
      duration: asNumber(track.duration),
      played_at: readPlayedAt(like),
      permalink_url: track.permalink_url ?? "",
    };
  }

  function sendProgress(loaded, phase, user) {
    chrome.runtime.sendMessage({
      action: "fetchProgress",
      loaded,
      phase,
      user,
    });
  }

  async function runLikesFetch() {
    sendProgress(0, "auth");

    const { oauth, clientId, likesUrl } = await getPageAuth();
    if (!oauth) {
      throw new Error("Not logged in to SoundCloud. Sign in and try again.");
    }
    if (!clientId) {
      throw new Error("Could not find SoundCloud client_id on this page.");
    }

    sendProgress(0, "user");
    const me = await fetchMe(oauth, clientId);
    const user = {
      id: me.id,
      username: me.username ?? me.full_name ?? "Unknown",
    };

    sendProgress(0, "discover", user);
    const { startUrl, endpoint, firstPage } = await discoverLikesStartUrl(
      user.id,
      clientId,
      oauth,
      likesUrl
    );

    sendProgress(0, "loading", user);
    const likes = await fetchAllLikes(startUrl, oauth, firstPage, (loaded, phase) => {
      sendProgress(loaded, phase, user);
    });

    const tracks = likes.map(mapLikeEntry).filter(Boolean);

    const payload = {
      action: "fetchComplete",
      user,
      endpoint,
      stats: { total: tracks.length },
      tracks,
    };

    chrome.runtime.sendMessage(payload);
    return payload;
  }
})();
