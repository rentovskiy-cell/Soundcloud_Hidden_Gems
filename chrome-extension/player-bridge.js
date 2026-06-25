(function () {
  if (window.__scHiddenGemsPlayerBridgeAttached) return;
  window.__scHiddenGemsPlayerBridgeAttached = true;

  const MESSAGE_SOURCE = "sc-hidden-gems";
  const REPLY_SOURCE = "sc-hidden-gems-player-bridge";
  const PENDING_KEY = "sc-hidden-gems-pending-play";

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCE) return;
    const { action, requestId } = event.data;
    if (!requestId) return;

    let result;
    try {
      if (action === "ping") {
        result = { ok: true, pong: true };
      } else if (action === "playTrack") {
        result = await playTrack(event.data.track);
      } else if (action === "resumePendingPlay") {
        result = await resumePendingPlay();
      } else if (action === "togglePlayback") {
        result = await togglePlayback();
      } else if (action === "pausePlayback") {
        result = pausePlayback();
      } else if (action === "getPlayerState") {
        result = { ok: true, state: readPlayerState() };
      } else {
        return;
      }
    } catch (error) {
      result = { ok: false, error: error.message ?? String(error) };
    }

    window.postMessage({ source: REPLY_SOURCE, requestId, ...result }, "*");
  });

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizePath(url) {
    try {
      const parsed = url.startsWith("http") ? new URL(url) : new URL(url, window.location.origin);
      return parsed.pathname.replace(/\/$/, "");
    } catch {
      return String(url ?? "").replace(/\/$/, "");
    }
  }

  function permalinksMatch(a, b) {
    if (!a || !b) return false;
    return normalizePath(a) === normalizePath(b);
  }

  function buttonLabel(element) {
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent ||
      ""
    ).toLowerCase();
  }

  function isPlayButton(element) {
    const label = buttonLabel(element);
    if (label.includes("pause")) return false;
    return label.includes("play") || element.classList.contains("sc-button-play");
  }

  function isPauseButton(element) {
    return buttonLabel(element).includes("pause");
  }

  function isPlaybackBar(element) {
    if (!element) return false;
    return !!element.closest(
      'footer, [class*="playbackBar"], [class*="playControls"][class*="playback"]'
    );
  }

  function getPlaybackFooter() {
    return (
      document.querySelector("footer") ||
      document.querySelector('[class*="playbackBar"]') ||
      document.querySelector('[class*="playControls"]')
    );
  }

  function isActuallyPlaying() {
    const media = getActiveMediaElement();
    if (media) {
      return !media.paused && !media.ended && media.readyState > 2;
    }

    const audio = document.querySelector("audio");
    if (audio) {
      return !audio.paused && !audio.ended && audio.readyState > 2;
    }

    const footer = getPlaybackFooter();
    if (footer) {
      const pauseInFooter = footer.querySelector(
        'button[aria-label*="Pause" i], [role="button"][aria-label*="Pause" i]'
      );
      const playInFooter = footer.querySelector(
        'button[aria-label*="Play" i], [role="button"][aria-label*="Play" i]'
      );
      if (pauseInFooter && !playInFooter) return true;
      if (playInFooter && buttonLabel(playInFooter).includes("play current")) return false;
    }

    return false;
  }

  function queryControlElements(scope) {
    return scope.querySelectorAll(
      'button, [role="button"], a.sc-button-play, button.sc-button-play, [data-testid*="play" i]'
    );
  }

  function findTrackLinks(permalinkUrl) {
    const path = normalizePath(permalinkUrl);
    const links = [];

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) continue;
      try {
        const linkPath = normalizePath(
          href.startsWith("http") ? href : `${window.location.origin}${href.startsWith("/") ? href : `/${href}`}`
        );
        if (linkPath === path) links.push(anchor);
      } catch {
        /* ignore */
      }
    }

    return links;
  }

  function findPlayButtonNearLink(link) {
    const containerSelectors = [
      "article", "li", "tr",
      '[class*="soundItem"]', '[class*="trackItem"]', '[class*="listItem"]',
      '[class*="track"]', '[class*="item"]', '[class*="sound"]',
    ];

    let container = null;
    for (const selector of containerSelectors) {
      container = link.closest(selector);
      if (container) break;
    }
    container = container || link.parentElement;

    for (let depth = 0; depth < 12 && container; depth += 1) {
      for (const btn of queryControlElements(container)) {
        if (isPlayButton(btn) && !isPlaybackBar(btn)) return btn;
      }
      container = container.parentElement;
    }

    return null;
  }

  function findPlayButtonForTrack(_trackId, permalinkUrl) {
    for (const link of findTrackLinks(permalinkUrl)) {
      const btn = findPlayButtonNearLink(link);
      if (btn) return btn;
    }
    return null;
  }

  function findBottomPlayButton() {
    const explicit = [
      'button[aria-label="Play current"]',
      'button[aria-label*="Play current" i]',
      'footer button.sc-button-play',
      '[class*="playControls"] button.sc-button-play',
      '[class*="playControls__control"][aria-label*="Play" i]',
    ];

    for (const selector of explicit) {
      const btn = document.querySelector(selector);
      if (btn && isPlayButton(btn)) return btn;
    }

    const footer = getPlaybackFooter();
    if (footer) {
      for (const btn of queryControlElements(footer)) {
        if (isPlayButton(btn)) return btn;
      }
    }

    return null;
  }

  function findHeroPlayButton() {
    for (const btn of queryControlElements(document)) {
      if (!isPlayButton(btn) || isPlaybackBar(btn)) continue;
      if (btn.closest('[class*="hero"], [class*="trackHeader"], main, [class*="soundHero"]')) {
        return btn;
      }
    }
    return null;
  }

  function getActiveMediaElement() {
    const candidates = [...document.querySelectorAll("audio, video")];
    const playing = candidates.find(
      (el) =>
        !el.paused &&
        !el.ended &&
        el.readyState >= 2 &&
        Number.isFinite(el.currentTime)
    );
    if (playing) return playing;

    return (
      candidates.find((el) => Number.isFinite(el.duration) && el.duration > 0) ||
      candidates[0] ||
      null
    );
  }

  function readPlayerState() {
    const media = getActiveMediaElement();
    const titleLink =
      document.querySelector("a.playbackSoundBadge__titleLink") ||
      document.querySelector('a[class*="playbackSoundBadge"][href*="soundcloud.com/"]');

    const artistLink =
      document.querySelector("a.playbackSoundBadge__lightLink") ||
      document.querySelector('a[class*="playbackSoundBadge"][class*="light"][href]');

    const duration = media?.duration;
    const currentTime = media?.currentTime;

    return {
      permalink: titleLink?.href ?? null,
      title: titleLink?.textContent?.trim() ?? "",
      artist: artistLink?.textContent?.trim() ?? "",
      isPlaying: isActuallyPlaying(),
      hasPlayer: !!(titleLink || getPlaybackFooter()),
      currentTime: Number.isFinite(currentTime) ? currentTime : 0,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    };
  }

  function clickElement(element) {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    if (typeof element.click === "function") element.click();
  }

  function pressSpaceToTogglePlay() {
    const target = document.body || document.documentElement;
    for (const type of ["keydown", "keypress", "keyup"]) {
      target.dispatchEvent(
        new KeyboardEvent(type, {
          key: " ",
          code: "Space",
          keyCode: 32,
          which: 32,
          bubbles: true,
          cancelable: true,
        })
      );
    }
  }

  async function forceStartPlayback() {
    if (isActuallyPlaying()) return true;

    const candidates = [
      findBottomPlayButton(),
      document.querySelector('button[aria-label="Play current"]'),
      document.querySelector('button[aria-label*="Play current" i]'),
      findHeroPlayButton(),
    ].filter(Boolean);

    const seen = new Set();
    for (const btn of candidates) {
      if (seen.has(btn)) continue;
      seen.add(btn);
      clickElement(btn);
      await sleep(350);
      if (isActuallyPlaying()) return true;
    }

    pressSpaceToTogglePlay();
    await sleep(350);
    if (isActuallyPlaying()) return true;

    const footer = getPlaybackFooter();
    if (footer) {
      for (const btn of footer.querySelectorAll("button, [role='button']")) {
        if (isPlayButton(btn)) {
          clickElement(btn);
          await sleep(350);
          if (isActuallyPlaying()) return true;
        }
      }
    }

    return isActuallyPlaying();
  }

  function setPendingPlay(track) {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ track, ts: Date.now() }));
  }

  function notifyPendingComplete(state) {
    window.postMessage({ source: REPLY_SOURCE, action: "pendingPlayComplete", state }, "*");
  }

  async function waitForTrackInPlayer(permalinkUrl, maxMs = 20000) {
    const path = normalizePath(permalinkUrl);
    const deadline = Date.now() + maxMs;

    while (Date.now() < deadline) {
      const state = readPlayerState();
      if (permalinksMatch(state.permalink, permalinkUrl)) return true;
      if (normalizePath(window.location.pathname) === path && state.hasPlayer) return true;
      await sleep(300);
    }

    return permalinksMatch(readPlayerState().permalink, permalinkUrl);
  }

  async function ensurePlaybackStarted(permalinkUrl, maxAttempts = 30) {
    await waitForTrackInPlayer(permalinkUrl, 12000);

    for (let i = 0; i < maxAttempts; i += 1) {
      if (isActuallyPlaying()) return true;
      const started = await forceStartPlayback();
      if (started) return true;
      await sleep(400);
    }

    return isActuallyPlaying();
  }

  async function tryInlinePlay(track) {
    const btn = findPlayButtonForTrack(track.id, track.permalink_url);
    if (!btn) return false;

    clickElement(btn);

    for (let i = 0; i < 25; i += 1) {
      await sleep(200);
      if (isActuallyPlaying()) return true;
    }

    return await forceStartPlayback();
  }

  async function resumePendingPlay() {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return { ok: true, resumed: false };

    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
      return { ok: false, error: "Invalid pending play data" };
    }

    if (!pending?.track?.permalink_url || Date.now() - pending.ts > 120000) {
      sessionStorage.removeItem(PENDING_KEY);
      return { ok: true, resumed: false };
    }

    const started = await ensurePlaybackStarted(pending.track.permalink_url, 25);
    const state = readPlayerState();

    if (started) {
      sessionStorage.removeItem(PENDING_KEY);
      notifyPendingComplete(state);
      return { ok: true, resumed: true, state };
    }

    notifyPendingComplete(state);
    return { ok: false, error: "Track loaded but playback did not start", state };
  }

  async function playTrack(track) {
    if (!track?.permalink_url) {
      return { ok: false, error: "Track has no SoundCloud URL" };
    }

    const current = readPlayerState();
    if (permalinksMatch(current.permalink, track.permalink_url)) {
      if (isActuallyPlaying()) {
        return { ok: true, method: "already-playing", state: current };
      }
      const started = await ensurePlaybackStarted(track.permalink_url, 15);
      return started
        ? { ok: true, method: "resume", state: readPlayerState() }
        : { ok: false, error: "Track loaded but playback did not start" };
    }

    const inline = await tryInlinePlay(track);
    if (inline) {
      return { ok: true, method: "inline", state: readPlayerState() };
    }

    setPendingPlay(track);
    window.location.assign(track.permalink_url);
    return { ok: true, method: "navigate-pending", pending: true };
  }

  async function togglePlayback() {
    if (isActuallyPlaying()) {
      const footer = getPlaybackFooter();
      const pauseBtn =
        footer?.querySelector('button[aria-label*="Pause" i], [role="button"][aria-label*="Pause" i]') ||
        document.querySelector('button[aria-label*="Pause" i]');
      if (pauseBtn) clickElement(pauseBtn);
    } else {
      const started = await forceStartPlayback();
      if (!started) return { ok: false, error: "No SoundCloud player control found" };
    }
    return { ok: true, state: readPlayerState() };
  }

  function pausePlayback() {
    const pauseBtn = document.querySelector('button[aria-label*="Pause" i]');
    if (pauseBtn) clickElement(pauseBtn);
    return { ok: true, state: readPlayerState() };
  }

  function schedulePendingResume() {
    [1500, 3500, 6000].forEach((delay) => {
      setTimeout(() => {
        resumePendingPlay().catch(() => {});
      }, delay);
    });
  }

  schedulePendingResume();
})();
