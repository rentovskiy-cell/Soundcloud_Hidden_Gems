(function () {
  if (window.__scHiddenGemsBridge) return;
  window.__scHiddenGemsBridge = true;

  const LIKES_URL_RE =
    /api-v2\.soundcloud\.com\/users\/(\d+)\/(track_likes|likes)(?:\/|\?|$)/;

  function rememberLikesUrl(url) {
    if (!url || typeof url !== "string") return;
    if (!LIKES_URL_RE.test(url)) return;
    window.__scHiddenGemsLikesUrl = url;
  }

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const input = args[0];
    const url =
      typeof input === "string" ? input : input instanceof Request ? input.url : "";
    rememberLikesUrl(url);
    return originalFetch.apply(this, args);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    rememberLikesUrl(url);
    return originalOpen.call(this, method, url, ...rest);
  };

  function readOAuthToken() {
    const match = document.cookie.match(/(?:^|;\s*)oauth_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function readClientId() {
    const captured = window.__scHiddenGemsLikesUrl;
    if (captured) {
      try {
        const id = new URL(captured).searchParams.get("client_id");
        if (id) return id;
      } catch {
        /* ignore */
      }
    }

    const html = document.documentElement.innerHTML;
    const patterns = [
      /client_id=([a-zA-Z0-9]{10,})/,
      /"client_id"\s*:\s*"([a-zA-Z0-9]+)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "sc-hidden-gems") return;
    if (event.data.action !== "getAuth") return;

    window.postMessage(
      {
        source: "sc-hidden-gems-bridge",
        action: "auth",
        oauth: readOAuthToken(),
        clientId: readClientId(),
        likesUrl: window.__scHiddenGemsLikesUrl ?? null,
      },
      "*"
    );
  });
})();
