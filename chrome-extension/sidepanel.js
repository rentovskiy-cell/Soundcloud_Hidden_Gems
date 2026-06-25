const STORAGE_SEEN = "sc-hidden-gems-seen";
const STORAGE_GEMS = "sc-hidden-gems-favorites";
const STORAGE_CUSTOM_PRESETS = "sc-hidden-gems-custom-presets";
const STORAGE_LIKES_CACHE = "sc-hidden-gems-likes-cache";
const STORAGE_USER_TAGS = "sc-hidden-gems-user-tags";
const EXTENSION_VERSION = "2.1.2";
const PRIVACY_POLICY_URL =
  "https://rentovskiy-cell.github.io/Soundcloud_Hidden_Gems/privacy.html";
const BUILTIN_PRESET_NAME = "Default";

const REMOVED_PRESET_NAMES = new Set([
  "Hidden Gems",
  "Underground",
  "Micro Artists",
  "Local Artists",
  "Forgotten Gems",
]);

const DEFAULT_PRESET = {
  name: BUILTIN_PRESET_NAME,
  maxPlays: 5000,
  maxFollowers: 5000,
  maxDuration: 20,
  likedWithin: "all",
  excludeMixes: true,
  excludePodcasts: true,
  excludeLive: true,
  hideSeen: false,
  clipsFilter: "hide",
};

const LIKED_WITHIN_LABELS = {
  30: "Last 30 days",
  90: "Last 90 days",
  180: "Last 6 months",
  365: "Last year",
  older365: "Liked > 1 year ago",
  older730: "Liked > 2 years ago",
  older1095: "Liked > 3 years ago",
};

const DJ_SET_KEYWORDS = [
  "dj set", "dj-set", "live set", "boiler room", "podcast", "radio show",
  "guest mix", "recorded live", "essential mix", "mix series",
];
const DJ_SET_SAFE = [
  "club mix", "extended mix", "original mix", "dub mix", "remix", "rework", "edit",
];
const PODCAST_KEYWORDS = ["podcast", "episode", "ep.", "radio show"];
const CLIP_TITLE_PATTERNS = [
  /\(clips?\)/i,
  /\[clips?\]/i,
  /\(previews?\)/i,
  /\[previews?\]/i,
  /\(snippets?\)/i,
  /\[snippets?\]/i,
  /^preview\s*:/i,
  /\?\s*clip\s*$/i,
  /\s-\s*clip\s*$/i,
  /\|\|\s*clip\s*$/i,
  /\bteasers?\b/i,
  /\bsamplers?\b/i,
];
const CLIP_URL_PATTERNS = [
  /[-_/](?:ep-)?clips?(?:[-_./]|$)/i,
  /[-_/]snippets?(?:[-_./]|$)/i,
  /[-_/]previews?(?:[-_./]|$)/i,
  /soundcloud-clips/i,
];
const CLIP_FALSE_POSITIVE_RE = /\b(eclipse|eclipses|sampledelia)\b/i;
const UPLOADER_CHANNEL_KEYS = new Set([
  "houseum",
  "recordeep",
  "house six",
  "moskalus",
  "the ransom note",
  "ransom note",
  "undrtone",
  "undrtoneblog",
  "blanc",
  "blancaudio",
  "maisonlabel",
  "four heads",
  "hurfyd",
  "torture the artist",
  "meoko",
  "sinchi collective",
  "afterravee",
  "connect musik",
  "deep raaga",
  "7898",
  "when we dip",
  "when we dip records",
  "data transmission",
  "defected records",
  "glitterbox",
  "toolroom",
  "trax magazine",
  "french express",
  "eastenderz",
  "body movement",
  "novaj",
  "houz",
  "mixmag",
  "soundbots",
  "soundb0ts",
  "slothboogie",
  "boiler room",
]);
const TITLE_DASH_RE = /\s[-–—─]\s+/;
const LABEL_INVISIBLE_RE = /[\u200b-\u200c-\u200d\ufeff\u00ad]/g;

function normalizeChannelKey(value) {
  return normalizeLabel(value);
}

function isUploaderChannel(uploaderKey) {
  if (!uploaderKey) return false;
  if (UPLOADER_CHANNEL_KEYS.has(uploaderKey)) return true;
  for (const channel of UPLOADER_CHANNEL_KEYS) {
    if (uploaderKey.includes(channel) || channel.includes(uploaderKey)) return true;
  }
  return false;
}

function stripPremiereTitleMarkers(title) {
  let t = String(title ?? "").trim();
  t = t.replace(/^[\s\S]{0,40}?(?:hur[f]?clusive|exclusive)\s*[➟→|:|\-–—]\s*/i, "");
  t = t.replace(/^(?:sb\s+)?premiere\s*[:|\-–—]\s*/i, "");
  t = t.replace(/^exclusive\s*[:|\-–—]\s*/i, "");
  t = t.replace(/^premiere\s+/i, "");
  t = t.replace(/\s*[-–—|]\s*premiere\s*$/i, "");
  t = t.replace(/\s*[-–—|]\s*exclusive\s*$/i, "");
  return t.trim();
}

function isTrackPositionToken(value) {
  const token = String(value ?? "").trim();
  return /^(?:[A-Z]{2,}\d{2,}|[A-Z]\d+)$/i.test(token);
}

function parseArtistFromQuotedTitle(title) {
  const match = title.match(/^(.+?)\s+['"]([^'"]+)['"]\s*(?:\[[^\]]*\])?\s*$/);
  if (!match) return null;

  const artist = formatLabelDisplay(match[1]);
  if (!artist || artist.length < 2) return null;
  if (/^premiere$/i.test(artist) || /^exclusive$/i.test(artist)) return null;

  return artist;
}

function parseArtistFromDjSetTitle(title) {
  if (!/\bboiler room\b/i.test(title) && !/\bdj set\b/i.test(title)) return null;

  let working = title.split(/\s+b2b\s+/i)[0].trim();
  working = working.split(/\s+boiler room/i)[0].trim();
  working = working.split(/\s+x\s+/i)[0].trim();

  const artist = formatLabelDisplay(working);
  if (!artist || artist.length < 2) return null;
  if (/^boiler room$/i.test(artist)) return null;

  return artist;
}

function parseArtistFromChannelTitle(title) {
  let working = stripPremiereTitleMarkers(title);
  if (!working) return null;

  const quotedArtist = parseArtistFromQuotedTitle(working);
  if (quotedArtist) return quotedArtist;

  const djSetArtist = parseArtistFromDjSetTitle(working);
  if (djSetArtist) return djSetArtist;

  if (!TITLE_DASH_RE.test(working)) return null;

  let parts = working.split(TITLE_DASH_RE).map((part) => part.trim()).filter(Boolean);
  while (parts.length > 1 && isTrackPositionToken(parts[0])) {
    parts.shift();
  }

  if (parts.length < 2) return null;

  const artist = formatLabelDisplay(parts[0]);
  if (!artist || artist.length < 2) return null;
  if (/^premiere$/i.test(artist) || /^exclusive$/i.test(artist)) return null;

  return artist;
}

function shouldExtractUploaderArtist(track) {
  const title = track?.title ?? "";
  const genre = track?.genre ?? "";
  const tags = track?.tag_list ?? "";
  const url = track?.permalink_url ?? "";
  const uploaderKey = normalizeChannelKey(track?.username ?? "");

  if (isUploaderChannel(uploaderKey)) return true;

  if (/^(?:sb\s+)?premiere\s*[:|\-–—]/i.test(title)) return true;
  if (/^premiere\s+/i.test(title)) return true;
  if (/\s[-–—|]\s*premiere\s*$/i.test(title)) return true;
  if (/^exclusive\s*[:|\-–—]/i.test(title)) return true;
  if (/hur[f]?clusive/i.test(title)) return true;
  if (/premiere/i.test(genre)) return true;

  if (/premiere|exclusive/i.test(tags)) return true;
  if (/\/premiere[-_/]/i.test(url)) return true;

  return false;
}

function getArtistInfo(track) {
  const uploader = track?.username ?? "";
  const uploaderKey = normalizeChannelKey(uploader);
  const premierePost = shouldExtractUploaderArtist(track);
  const extractedArtist = premierePost ? parseArtistFromChannelTitle(track?.title) : null;

  if (extractedArtist) {
    return {
      raw: extractedArtist,
      key: normalizeLabel(extractedArtist),
      display: extractedArtist,
      uploader,
      uploaderKey,
      isPremierePost: premierePost,
    };
  }

  if (premierePost && isUploaderChannel(uploaderKey)) {
    return {
      raw: "",
      key: "",
      display: formatLabelDisplay(uploader),
      uploader,
      uploaderKey,
      isPremierePost: true,
      isChannelOnly: true,
    };
  }

  return {
    raw: uploader,
    key: uploaderKey,
    display: formatLabelDisplay(uploader),
    uploader,
    uploaderKey,
    isPremierePost: premierePost,
  };
}

function stripClipCatalogCodes(text) {
  return String(text ?? "").replace(/\[CLIPP\d+\]/gi, "");
}

function isClipOrSnippet(track) {
  const title = track?.title ?? "";
  const titleClean = stripClipCatalogCodes(title);
  const tagText = `${track?.tag_list ?? ""} ${track?.genre ?? ""}`;

  for (const pattern of CLIP_TITLE_PATTERNS) {
    if (pattern.test(titleClean)) return true;
  }

  if (!CLIP_FALSE_POSITIVE_RE.test(titleClean)) {
    if (/\bclips\b/i.test(titleClean) || /\bclip\b/i.test(titleClean)) return true;
    if (/\bsnippets?\b/i.test(titleClean) || /\bpreviews?\b/i.test(titleClean)) return true;
  }

  if (/\bclips?\b/i.test(tagText) || /\bsnippets?\b/i.test(tagText) || /\bpreviews?\b/i.test(tagText)) {
    return true;
  }

  const url = (track?.permalink_url ?? "").toLowerCase();
  return CLIP_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function countClips(tracks) {
  return tracks.filter(isClipOrSnippet).length;
}

function getTrackLabelRaw(track) {
  return track?.label_name ?? "";
}

function normalizeLabel(value) {
  if (value == null) return "";
  return String(value).replace(LABEL_INVISIBLE_RE, "").trim().toLowerCase();
}

function formatLabelDisplay(value) {
  return String(value ?? "").replace(LABEL_INVISIBLE_RE, "").trim();
}

function getTrackLabelInfo(track) {
  const raw = getTrackLabelRaw(track);
  return {
    raw,
    key: normalizeLabel(raw),
    display: formatLabelDisplay(raw),
  };
}

function setLabelFilter(normalizedKey, displayName) {
  const key = normalizeLabel(normalizedKey) || normalizeLabel(displayName);
  if (!key) {
    clearLabelFilter();
    return;
  }
  clearArtistFilter({ apply: false });
  state.labelFilter = key;
  state.labelFilterDisplay = formatLabelDisplay(displayName || normalizedKey || key);
  updateActiveLabelBar();
  updateActiveFilterSummary();
  applyFilters();
}

function readLabelFromButton(btn) {
  const key = btn.getAttribute("data-label-key") ?? btn.dataset.labelKey ?? "";
  const display = btn.getAttribute("data-label-display") ?? btn.dataset.labelDisplay ?? "";
  return { key, display };
}

function clearTagFilter() {
  state.tagFilter = null;
  state.tagFilterDisplay = null;
  updateActiveTagBar();
  updateActiveFilterSummary();
  applyFilters();
}

function clearUserTagFilter({ apply = true } = {}) {
  state.userTagFilter = null;
  state.userTagFilterDisplay = null;
  updateActiveUserTagBar();
  if (apply) {
    updateActiveFilterSummary();
    applyFilters();
  }
}

function setUserTagFilter(normalizedKey, displayName) {
  const key = normalizeUserTagKey(normalizedKey) || normalizeUserTagKey(displayName);
  if (!key) {
    clearUserTagFilter();
    return;
  }
  state.userTagFilter = key;
  state.userTagFilterDisplay = formatTagDisplay(displayName || normalizedKey || key);
  updateActiveUserTagBar();
  updateActiveFilterSummary();
  applyFilters();
}

function setTagFilter(normalizedKey, displayName) {
  const key = normalizeTag(normalizedKey) || normalizeTag(displayName);
  if (!key) {
    clearTagFilter();
    return;
  }
  state.tagFilter = key;
  state.tagFilterDisplay = formatTagDisplay(displayName || normalizedKey || key);
  updateActiveTagBar();
  updateActiveFilterSummary();
  applyFilters();
}

function normalizeTag(value) {
  if (value == null) return "";
  return String(value).replace(LABEL_INVISIBLE_RE, "").trim().toLowerCase();
}

function formatTagDisplay(value) {
  return String(value ?? "").replace(LABEL_INVISIBLE_RE, "").trim();
}

function parseTrackTags(track) {
  const tags = [];
  const seen = new Set();

  const add = (raw) => {
    const display = formatTagDisplay(raw);
    const key = normalizeTag(display);
    if (!key || seen.has(key)) return;
    seen.add(key);
    tags.push({ key, display });
  };

  if (track?.genre) add(track.genre);

  const raw = track?.tag_list ?? "";
  if (typeof raw === "string" && raw.trim()) {
    const quoted = raw.match(/"([^"]+)"/g);
    if (quoted) {
      quoted.forEach((part) => add(part.replace(/"/g, "")));
    } else {
      raw.split(/\s+/).forEach((part) => add(part));
    }
  }

  return tags;
}

function trackHasTag(track, tagKey) {
  return parseTrackTags(track).some((t) => t.key === tagKey);
}

function getUserTagsMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_USER_TAGS) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveUserTagsMap(map) {
  localStorage.setItem(STORAGE_USER_TAGS, JSON.stringify(map));
}

function getUserTagsForTrack(trackId) {
  if (trackId == null) return [];
  const list = getUserTagsMap()[String(trackId)];
  if (!Array.isArray(list)) return [];
  return list.map(formatTagDisplay).filter(Boolean);
}

function normalizeUserTagKey(value) {
  return normalizeTag(value);
}

function setUserTagsForTrack(trackId, displays) {
  const id = String(trackId);
  const map = getUserTagsMap();
  const tags = [...new Set(displays.map(formatTagDisplay).filter(Boolean))];
  if (tags.length === 0) delete map[id];
  else map[id] = tags;
  saveUserTagsMap(map);
}

function addUserTag(trackId, rawTag) {
  const display = formatTagDisplay(rawTag);
  if (!display || trackId == null) return;
  const existing = getUserTagsForTrack(trackId);
  const key = normalizeUserTagKey(display);
  if (existing.some((tag) => normalizeUserTagKey(tag) === key)) return;
  setUserTagsForTrack(trackId, [...existing, display]);
}

function removeUserTag(trackId, tagKey) {
  if (trackId == null || !tagKey) return;
  const filtered = getUserTagsForTrack(trackId).filter(
    (tag) => normalizeUserTagKey(tag) !== tagKey
  );
  setUserTagsForTrack(trackId, filtered);
}

function trackHasUserTag(track, tagKey) {
  return getUserTagsForTrack(track.id).some((tag) => normalizeUserTagKey(tag) === tagKey);
}

function computeTopUserTags(tracks) {
  const groups = new Map();

  for (const track of tracks) {
    for (const display of getUserTagsForTrack(track.id)) {
      const key = normalizeUserTagKey(display);
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, { count: 0, display });
      }
      groups.get(key).count += 1;
    }
  }

  return [...groups.entries()]
    .map(([key, { count, display }]) => ({ key, display, count }))
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
}

function renderUserTagsCell(track) {
  const trackId = escapeHtml(track.id ?? "");
  const tags = getUserTagsForTrack(track.id);
  const chips = tags
    .map((display) => {
      const key = normalizeUserTagKey(display);
      const active = state.userTagFilter === key ? " user-tag-chip-active" : "";
      return `<span class="user-tag-chip${active}">
          <button type="button" class="user-tag-filter" data-user-tag-key="${escapeHtml(key)}" data-user-tag-display="${escapeHtml(display)}">${escapeHtml(display)}</button>
          <button type="button" class="user-tag-remove" data-remove-user-tag data-track-id="${trackId}" data-user-tag-key="${escapeHtml(key)}" aria-label="Remove tag">×</button>
        </span>`;
    })
    .join("");

  return `<td class="user-tags-cell">
    <div class="user-tags-wrap">${chips}<button type="button" class="user-tag-add" data-add-user-tag data-track-id="${trackId}" aria-label="Add tag">+</button></div>
  </td>`;
}

function readUserTagFromButton(btn) {
  const key = btn.getAttribute("data-user-tag-key") ?? btn.dataset.userTagKey ?? "";
  const display = btn.getAttribute("data-user-tag-display") ?? btn.dataset.userTagDisplay ?? "";
  return { key, display };
}

function readTagFromButton(btn) {
  const key = btn.getAttribute("data-tag-key") ?? btn.dataset.tagKey ?? "";
  const display = btn.getAttribute("data-tag-display") ?? btn.dataset.tagDisplay ?? "";
  return { key, display };
}

function clearLabelFilter({ apply = true } = {}) {
  state.labelFilter = null;
  state.labelFilterDisplay = null;
  updateActiveLabelBar();
  if (apply) {
    updateActiveFilterSummary();
    applyFilters();
  }
}


function readArtistFromButton(btn) {
  const key = btn.getAttribute("data-artist-key") ?? btn.dataset.artistKey ?? "";
  const display = btn.getAttribute("data-artist-display") ?? btn.dataset.artistDisplay ?? "";
  return { key, display };
}

function setArtistFilter(normalizedKey, displayName) {
  const key = normalizeLabel(normalizedKey) || normalizeLabel(displayName);
  if (!key) {
    clearArtistFilter();
    return;
  }
  clearLabelFilter({ apply: false });
  state.artistFilter = key;
  state.artistFilterDisplay = formatLabelDisplay(displayName || normalizedKey || key);
  updateActiveArtistBar();
  updateActiveFilterSummary();
  applyFilters();
}

function clearArtistFilter({ apply = true } = {}) {
  state.artistFilter = null;
  state.artistFilterDisplay = null;
  updateActiveArtistBar();
  if (apply) {
    updateActiveFilterSummary();
    applyFilters();
  }
}

function stripClipMarkersFromTitle(title) {
  return stripClipCatalogCodes(title)
    .replace(/\(clips?\)/gi, "")
    .replace(/\[clips?\]/gi, "")
    .replace(/\(previews?\)/gi, "")
    .replace(/\[previews?\]/gi, "")
    .replace(/\(snippets?\)/gi, "")
    .replace(/\[snippets?\]/gi, "")
    .replace(/^preview\s*:/i, "")
    .replace(/\s-\s*clip\s*$/i, "")
    .trim();
}

function extractCatalogToken(title) {
  const match = String(title ?? "").match(/\b[A-Z]{2,}\d{2,}[A-Z0-9]*\b/);
  return match ? match[0].toUpperCase() : "";
}

function findFullVersionTracks(clipTrack) {
  const artistKey = getArtistInfo(clipTrack).key;
  if (!artistKey) return [];

  const clipTitleNorm = normalizeLabel(stripClipMarkersFromTitle(clipTrack.title));
  const labelKey = getTrackLabelInfo(clipTrack).key;
  const catalog = extractCatalogToken(clipTrack.title);

  const matches = state.allTracks.filter((track) => {
    if (String(track.id) === String(clipTrack.id)) return false;
    if (isClipOrSnippet(track)) return false;
    if (getArtistInfo(track).key !== artistKey) return false;

    const fullTitle = normalizeLabel(track.title);
    if (catalog && String(track.title ?? "").toUpperCase().includes(catalog)) return true;

    if (clipTitleNorm.length >= 4) {
      if (fullTitle.includes(clipTitleNorm) || clipTitleNorm.includes(fullTitle)) return true;
    }

    if (labelKey && getTrackLabelInfo(track).key === labelKey) {
      const strippedFull = normalizeLabel(stripClipMarkersFromTitle(track.title));
      if (
        strippedFull &&
        clipTitleNorm &&
        (strippedFull.includes(clipTitleNorm.slice(0, 12)) ||
          clipTitleNorm.includes(strippedFull.slice(0, 12)))
      ) {
        return true;
      }
    }

    return false;
  });

  return matches.sort((a, b) => {
    const aClip = isClipOrSnippet(a) ? 1 : 0;
    const bClip = isClipOrSnippet(b) ? 1 : 0;
    if (aClip !== bClip) return aClip - bClip;
    return (b.playback_count ?? 0) - (a.playback_count ?? 0);
  });
}

async function handleFindFullVersion(clipTrack) {
  const matches = findFullVersionTracks(clipTrack);
  if (matches.length === 0) {
    showPlaybackError("No full version found in your likes");
    return;
  }

  if (matches.length === 1) {
    clearPlaybackMessage();
    await playTrackFromPanel(matches[0]);
    return;
  }

  const { key, display } = getArtistInfo(clipTrack);
  els.clipsFilter.value = "hide";
  setArtistFilter(key, display);
  updatePresetDisplay();
  updateClipsUi();
  showPlaybackStatus(`Found ${matches.length} possible full versions — filtered by artist`);
  setTimeout(() => clearPlaybackMessage(), 5000);
}

const sessionState = {
  gemIds: new Set(),
};

const state = {
  allTracks: [],
  activeTab: "all",
  sortKey: "played_at",
  sortDir: "desc",
  labelFilter: null,
  labelFilterDisplay: null,
  artistFilter: null,
  artistFilterDisplay: null,
  tagFilter: null,
  tagFilterDisplay: null,
  userTagFilter: null,
  userTagFilterDisplay: null,
  searchQuery: "",
  isApplyingPreset: false,
  filteredTracks: [],
  cacheLoadedAt: null,
  fetchInProgress: false,
};

const digSession = {
  active: false,
  advanceMode: "percent",
  advanceValue: 50,
  advancedForTrackId: null,
  playingTrackId: null,
  playingSince: null,
  mediaTimeAtStart: 0,
  pollTimer: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  document.title = "SoundCloud Hidden Gems";
  cacheElements();
  if (els.versionLabel) els.versionLabel.textContent = `v${EXTENSION_VERSION}`;
  migratePresets();
  initPresets();
  applyPreset(DEFAULT_PRESET, { syncDropdown: true });
  bindTabs();
  bindFilterInputs();
  bindSortHeaders();
  bindTableActions();
  bindPresetActions();
  bindNowPlayingControls();
  bindDigControls();
  bindSearch();
  bindRefresh();
  bindClipsControls();
  bindSessionControls();
  bindGemsControls();
  bindOnboarding();
  bindBrowseControls();
  parseDigAdvanceSetting();
  initPlayback();
  updateSliderOutputs();
  updateSeenStat();
  updateGemsStat();
  updateSessionUi();
  await bootstrapLikes();
});

function cacheElements() {
  Object.assign(els, {
    userLabel: document.getElementById("user-label"),
    cacheInfo: document.getElementById("cache-info"),
    refreshLikes: document.getElementById("refresh-likes"),
    versionLabel: document.getElementById("version-label"),
    privacyLink: document.getElementById("privacy-link"),
    onboarding: document.getElementById("onboarding"),
    openSoundCloud: document.getElementById("open-soundcloud"),
    onboardingLoad: document.getElementById("onboarding-load"),
    status: document.getElementById("status"),
    progressWrap: document.getElementById("progress-wrap"),
    progressFill: document.getElementById("progress-fill"),
    progressText: document.getElementById("progress-text"),
    mainUi: document.getElementById("main-ui"),
    tabAll: document.getElementById("tab-all"),
    tabGems: document.getElementById("tab-gems"),
    tabSession: document.getElementById("tab-session"),
    sessionBar: document.getElementById("session-bar"),
    sessionGemCount: document.getElementById("session-gem-count"),
    sessionView: document.getElementById("session-view"),
    sessionExportJson: document.getElementById("session-export-json"),
    sessionCopyUrls: document.getElementById("session-copy-urls"),
    sessionClear: document.getElementById("session-clear"),
    gemsBar: document.getElementById("gems-bar"),
    gemsBarCount: document.getElementById("gems-bar-count"),
    gemsExportJson: document.getElementById("gems-export-json"),
    gemsCopyUrls: document.getElementById("gems-copy-urls"),
    statSessionGems: document.getElementById("stat-session-gems"),
    currentPresetDisplay: document.getElementById("current-preset-display"),
    activeLabelBar: document.getElementById("active-label-bar"),
    labelFilterName: document.getElementById("label-filter-name"),
    clearLabelFilter: document.getElementById("clear-label-filter"),
    activeArtistBar: document.getElementById("active-artist-bar"),
    artistFilterName: document.getElementById("artist-filter-name"),
    clearArtistFilter: document.getElementById("clear-artist-filter"),
    activeTagBar: document.getElementById("active-tag-bar"),
    tagFilterName: document.getElementById("tag-filter-name"),
    clearTagFilter: document.getElementById("clear-tag-filter"),
    activeUserTagBar: document.getElementById("active-user-tag-bar"),
    userTagFilterName: document.getElementById("user-tag-filter-name"),
    clearUserTagFilter: document.getElementById("clear-user-tag-filter"),
    activeFilterList: document.getElementById("active-filter-list"),
    resetFilters: document.getElementById("reset-filters"),
    filters: document.getElementById("filters"),
    presetSelect: document.getElementById("preset-select"),
    savePreset: document.getElementById("save-preset"),
    renamePreset: document.getElementById("rename-preset"),
    deletePreset: document.getElementById("delete-preset"),
    maxPlays: document.getElementById("max-plays"),
    maxFollowers: document.getElementById("max-followers"),
    maxDuration: document.getElementById("max-duration"),
    likedWithin: document.getElementById("liked-within"),
    playsOut: document.getElementById("plays-out"),
    followersOut: document.getElementById("followers-out"),
    durationOut: document.getElementById("duration-out"),
    excludeMixes: document.getElementById("exclude-mixes"),
    excludePodcasts: document.getElementById("exclude-podcasts"),
    excludeLive: document.getElementById("exclude-live"),
    hideSeen: document.getElementById("hide-seen"),
    clipsFilter: document.getElementById("clips-filter"),
    clipsQuickBar: document.getElementById("clips-quick-bar"),
    clipsCount: document.getElementById("clips-count"),
    browseClips: document.getElementById("browse-clips"),
    activeClipsBar: document.getElementById("active-clips-bar"),
    clearClipsOnly: document.getElementById("clear-clips-only"),
    statsMore: document.getElementById("stats-more"),
    statsSummary: document.getElementById("stats-summary"),
    statTotal: document.getElementById("stat-total"),
    statMatching: document.getElementById("stat-matching"),
    statClips: document.getElementById("stat-clips"),
    statUnseen: document.getElementById("stat-unseen"),
    statGems: document.getElementById("stat-gems"),
    statAvgPlays: document.getElementById("stat-avg-plays"),
    statAvgFollowers: document.getElementById("stat-avg-followers"),
    statAvgPlaysWrap: document.getElementById("stat-avg-plays-wrap"),
    statAvgFollowersWrap: document.getElementById("stat-avg-followers-wrap"),
    statSeen: document.getElementById("stat-seen"),
    noMatchesNotice: document.getElementById("no-matches-notice"),
    topLabels: document.getElementById("top-labels"),
    topLabelsList: document.getElementById("top-labels-list"),
    topArtists: document.getElementById("top-artists"),
    topArtistsList: document.getElementById("top-artists-list"),
    browseArtists: document.getElementById("browse-artists"),
    browseArtistsSummary: document.getElementById("browse-artists-summary"),
    browseArtistsSearch: document.getElementById("browse-artists-search"),
    browseArtistsMin: document.getElementById("browse-artists-min"),
    browseArtistsList: document.getElementById("browse-artists-list"),
    browseLabels: document.getElementById("browse-labels"),
    browseLabelsSummary: document.getElementById("browse-labels-summary"),
    browseLabelsSearch: document.getElementById("browse-labels-search"),
    browseLabelsMin: document.getElementById("browse-labels-min"),
    browseLabelsList: document.getElementById("browse-labels-list"),
    topTags: document.getElementById("top-tags"),
    topTagsList: document.getElementById("top-tags-list"),
    myTags: document.getElementById("my-tags"),
    myTagsList: document.getElementById("my-tags-list"),
    myTagsSummary: document.getElementById("my-tags-summary"),
    trackSearch: document.getElementById("track-search"),
    error: document.getElementById("error"),
    tableWrap: document.getElementById("table-wrap"),
    tracksBody: document.getElementById("tracks-body"),
    nowPlaying: document.getElementById("now-playing"),
    npTitle: document.getElementById("np-title"),
    npArtist: document.getElementById("np-artist"),
    npPrevious: document.getElementById("np-previous"),
    npPlayPause: document.getElementById("np-play-pause"),
    npNextGem: document.getElementById("next-gem-fab"),
    digToggle: document.getElementById("dig-toggle"),
    digAdvance: document.getElementById("dig-advance"),
    digStatus: document.getElementById("dig-status"),
    playbackError: document.getElementById("playback-error"),
  });
}

const playbackUi = { mode: null };
const scrollState = { lastScrolledTrackId: null };

function enrichTrackArtist(track) {
  if (!track) return track;
  const artist = getArtistInfo(track);
  return { ...track, username: artist.display };
}

function initPlayback() {
  const originalPlayTrack = PlaybackController.playTrack.bind(PlaybackController);
  PlaybackController.playTrack = (track, opts) =>
    originalPlayTrack(enrichTrackArtist(track), opts);

  PlaybackController.init((playbackState) => {
    updateNowPlayingUi(playbackState);
    handleDigAdvance(playbackState);
    renderTable(state.filteredTracks);
    scrollToCurrentRowIfChanged(playbackState.currentTrack?.id);
  });
}

function bindDigControls() {
  els.digAdvance.addEventListener("change", () => {
    parseDigAdvanceSetting();
    updateDigStatus();
  });

  els.digToggle.addEventListener("click", async () => {
    if (digSession.active) {
      stopDigSession();
      return;
    }
    await startDigSession();
  });
}

function parseDigAdvanceSetting() {
  const [mode, rawValue] = (els.digAdvance.value || "percent:50").split(":");
  digSession.advanceMode = mode === "seconds" ? "seconds" : "percent";
  digSession.advanceValue = Number(rawValue) || (digSession.advanceMode === "seconds" ? 60 : 50);
}

function updateDigStatus() {
  if (!digSession.active) {
    els.digStatus.classList.add("hidden");
    return;
  }

  const unseen = countUnseenInFilter();
  const threshold =
    digSession.advanceMode === "seconds"
      ? `${digSession.advanceValue}s`
      : `${digSession.advanceValue}%`;
  els.digStatus.textContent = `Dig session active · ${formatNumber(unseen)} unseen · auto-advance at ${threshold}`;
  els.digStatus.classList.remove("hidden");
}

function updateDigToggleButton() {
  els.digToggle.textContent = digSession.active ? "Stop Dig Session" : "Start Dig Session";
  els.digToggle.classList.toggle("btn-dig-active", digSession.active);
  els.digAdvance.disabled = digSession.active;
}

async function startDigSession() {
  parseDigAdvanceSetting();
  if (state.filteredTracks.length === 0) {
    showPlaybackError("No tracks match current filters");
    return;
  }

  digSession.active = true;
  digSession.advancedForTrackId = null;
  digSession.playingTrackId = null;
  digSession.playingSince = null;
  digSession.mediaTimeAtStart = 0;
  updateDigToggleButton();
  updateDigStatus();
  hidePlaybackError();
  startDigPolling();

  if (!PlaybackController.currentTrack || !PlaybackController.isPlaying) {
    await playNextGem({ fromDig: true });
  }
}

function stopDigSession() {
  digSession.active = false;
  digSession.advancedForTrackId = null;
  digSession.playingTrackId = null;
  digSession.playingSince = null;
  digSession.mediaTimeAtStart = 0;
  stopDigPolling();
  updateDigToggleButton();
  els.digStatus.classList.add("hidden");
}

function startDigPolling() {
  if (digSession.pollTimer) return;
  digSession.pollTimer = setInterval(() => {
    if (digSession.active) PlaybackController.pollPlayerState();
  }, 500);
}

function stopDigPolling() {
  if (!digSession.pollTimer) return;
  clearInterval(digSession.pollTimer);
  digSession.pollTimer = null;
}

function syncDigPlaybackClock(playbackState) {
  const { currentTrack, isPlaying, currentTime } = playbackState;
  const trackId = currentTrack?.id != null ? String(currentTrack.id) : null;

  if (!digSession.active || !trackId || !isPlaying) {
    digSession.playingTrackId = null;
    digSession.playingSince = null;
    digSession.mediaTimeAtStart = 0;
    return;
  }

  if (trackId !== digSession.playingTrackId) {
    digSession.playingTrackId = trackId;
    digSession.playingSince = Date.now();
    digSession.mediaTimeAtStart = Number(currentTime) || 0;
    digSession.advancedForTrackId = null;
  }
}

function getEffectivePlaybackSeconds(playbackState) {
  const mediaTime = Number(playbackState.currentTime) || 0;
  if (!digSession.playingSince) return mediaTime;

  const wallTime =
    (Date.now() - digSession.playingSince) / 1000 + (digSession.mediaTimeAtStart || 0);
  return Math.max(mediaTime, wallTime);
}

function getEffectiveDurationSeconds(playbackState) {
  const mediaDuration = Number(playbackState.duration) || 0;
  if (mediaDuration > 0) return mediaDuration;

  const trackId = playbackState.currentTrack?.id;
  if (trackId == null) return 0;
  const track = state.allTracks.find((item) => String(item.id) === String(trackId));
  if (track?.duration > 0) return track.duration / 1000;
  return 0;
}

function handleDigAdvance(playbackState) {
  if (!digSession.active) return;

  syncDigPlaybackClock(playbackState);

  const { currentTrack, isPlaying } = playbackState;
  if (!currentTrack?.id || !isPlaying) return;

  const trackId = String(currentTrack.id);
  if (digSession.advancedForTrackId === trackId) return;

  const elapsed = getEffectivePlaybackSeconds(playbackState);
  let reached = false;

  if (digSession.advanceMode === "seconds") {
    reached = elapsed >= digSession.advanceValue;
  } else {
    const duration = getEffectiveDurationSeconds(playbackState);
    if (duration > 0) {
      reached = elapsed / duration >= digSession.advanceValue / 100;
    }
  }

  if (!reached) return;

  digSession.advancedForTrackId = trackId;
  markSeen(currentTrack.id);
  void playNextGem({ fromDig: true });
}

function bindClipsControls() {
  els.clipsFilter.addEventListener("change", () => {
    updatePresetDisplay();
    updateActiveFilterSummary();
    updateClipsUi();
    applyFilters();
  });

  els.browseClips.addEventListener("click", () => {
    els.clipsFilter.value = "only";
    updatePresetDisplay();
    updateActiveFilterSummary();
    updateClipsUi();
    applyFilters();
  });

  els.clearClipsOnly.addEventListener("click", () => {
    els.clipsFilter.value = "hide";
    updatePresetDisplay();
    updateActiveFilterSummary();
    updateClipsUi();
    applyFilters();
  });
}

function updateClipsUi() {
  const clipsTotal = countClips(state.allTracks);
  const mode = els.clipsFilter.value;

  els.statClips.textContent = formatNumber(clipsTotal);

  if (mode === "only") {
    els.activeClipsBar.classList.remove("hidden");
    els.clipsQuickBar.classList.add("hidden");
    return;
  }

  els.activeClipsBar.classList.add("hidden");

  if (mode === "hide" && clipsTotal > 0) {
    els.clipsCount.textContent = formatNumber(clipsTotal);
    els.clipsQuickBar.classList.remove("hidden");
  } else {
    els.clipsQuickBar.classList.add("hidden");
  }
}

function bindSearch() {
  els.trackSearch.addEventListener("input", () => {
    state.searchQuery = els.trackSearch.value.trim().toLowerCase();
    updateActiveFilterSummary();
    applyFilters();
  });
}

function bindRefresh() {
  els.refreshLikes.addEventListener("click", () => {
    requestFetchFromActiveTab({ force: true });
  });
}

async function bootstrapLikes() {
  const hadCache = await loadLikesFromCache();
  if (!hadCache) {
    showOnboarding();
    await requestFetchFromActiveTab();
  }
}

async function loadLikesFromCache() {
  try {
    const data = await chrome.storage.local.get(STORAGE_LIKES_CACHE);
    const cache = data[STORAGE_LIKES_CACHE];
    if (!cache?.tracks?.length) return false;

    showResults(
      {
        user: cache.user,
        tracks: cache.tracks,
        endpoint: cache.endpoint,
        stats: cache.stats,
      },
      { fromCache: true, cachedAt: cache.cachedAt }
    );
    return true;
  } catch {
    return false;
  }
}

async function saveLikesCache(payload) {
  try {
    await chrome.storage.local.set({
      [STORAGE_LIKES_CACHE]: {
        user: payload.user ?? null,
        tracks: payload.tracks ?? [],
        endpoint: payload.endpoint ?? null,
        stats: payload.stats ?? null,
        cachedAt: Date.now(),
      },
    });
  } catch {
    /* ignore quota errors */
  }
}

function updateCacheInfo() {
  if (!state.cacheLoadedAt) {
    els.cacheInfo.classList.add("hidden");
    return;
  }

  els.cacheInfo.textContent = `Cached ${formatCacheAge(state.cacheLoadedAt)} · click Refresh to update`;
  els.cacheInfo.classList.remove("hidden");
}

function formatCacheAge(timestamp) {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function countUnseenInFilter() {
  const seen = getSeenSet();
  return state.filteredTracks.filter(
    (track) => track.id != null && !seen.has(String(track.id))
  ).length;
}

function scrollToCurrentRowIfChanged(trackId) {
  if (trackId == null) {
    scrollState.lastScrolledTrackId = null;
    return;
  }

  const trackKey = String(trackId);
  if (scrollState.lastScrolledTrackId === trackKey) return;

  scrollState.lastScrolledTrackId = trackKey;

  const row = els.tracksBody.querySelector(
    `tr[data-track-row="${CSS.escape(trackKey)}"]`
  );
  row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function matchesSearchQuery(track, query) {
  if (!query) return true;
  const artist = getArtistInfo(track);
  const haystack = [
    track.title,
    track.username,
    artist.display,
    artist.uploader,
    track.genre,
    track.tag_list,
    getTrackLabelRaw(track),
    getUserTagsForTrack(track.id).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function bindNowPlayingControls() {
  els.npPlayPause.addEventListener("click", async () => {
    if (PlaybackController.currentTrack) {
      const result = await PlaybackController.togglePlayback();
      clearPlaybackMessage();
      if (!result.ok) showPlaybackError(result.error);
    } else if (state.filteredTracks.length > 0) {
      await playTrackFromPanel(state.filteredTracks[0]);
    } else {
      showPlaybackError("No tracks to play");
    }
  });

  els.npPrevious.addEventListener("click", async () => {
    const result = await PlaybackController.playPrevious();
    if (!result.ok) showPlaybackError(result.error);
    else hidePlaybackError();
  });

  els.npNextGem.addEventListener("click", () => playNextGem({ fromDig: digSession.active }));
}

async function playTrackFromPanel(track, { markSeenOnPlay = false } = {}) {
  clearPlaybackMessage();
  showPlaybackStatus("Starting…");

  if (PlaybackController.isCurrentTrack(track.id)) {
    const result = await PlaybackController.togglePlayback();
    clearPlaybackMessage();
    if (!result.ok) showPlaybackError(result.error);
    return result;
  }

  const result = await PlaybackController.playTrack(track, { addToHistory: true });

  if (!result.ok) {
    clearPlaybackMessage();
    showPlaybackError(result.error);
    return result;
  }

  if (result.pending && !PlaybackController.isPlaying) {
    showPlaybackStatus("Loading track…");
  } else {
    clearPlaybackMessage();
  }

  if (markSeenOnPlay) markSeen(track.id);
  return result;
}

async function playNextGem({ fromDig = false } = {}) {
  if (!fromDig) {
    clearPlaybackMessage();
    showPlaybackStatus("Finding a gem…");
  }

  const markFn = fromDig ? null : (trackId) => markSeen(trackId);
  const result = await PlaybackController.playNextGem(markFn);

  if (!result.ok) {
    if (digSession.active && result.error?.includes("No tracks")) {
      stopDigSession();
    }
    if (!fromDig) {
      clearPlaybackMessage();
      showPlaybackError(result.error);
    }
    return;
  }

  digSession.advancedForTrackId = null;
  digSession.playingTrackId = null;
  digSession.playingSince = null;
  digSession.mediaTimeAtStart = 0;

  if (!fromDig) {
    if (result.pending && !PlaybackController.isPlaying) {
      showPlaybackStatus("Loading track…");
    } else {
      clearPlaybackMessage();
    }
  }

  updateDigStatus();
}

function showPlaybackStatus(text) {
  playbackUi.mode = "loading";
  els.playbackError.textContent = text;
  els.playbackError.classList.remove("hidden");
  els.playbackError.classList.add("playback-status");
}

function clearPlaybackMessage() {
  playbackUi.mode = null;
  els.playbackError.classList.add("hidden");
  els.playbackError.classList.remove("playback-status");
  els.playbackError.textContent = "";
}

function showPlaybackError(text) {
  playbackUi.mode = "error";
  els.playbackError.classList.remove("playback-status");
  els.playbackError.textContent = text ?? "Playback failed";
  els.playbackError.classList.remove("hidden");
}

function hidePlaybackError() {
  clearPlaybackMessage();
}

function updateNowPlayingUi(playbackState) {
  const { currentTrack, isPlaying, hasPrevious, poolSize } = playbackState;

  if (currentTrack) {
    els.npTitle.textContent = currentTrack.title || "—";
    els.npArtist.textContent = currentTrack.username || "—";
    els.npPlayPause.textContent = isPlaying ? "Pause" : "Play";
  } else {
    els.npTitle.textContent = "—";
    els.npArtist.textContent = "—";
    els.npPlayPause.textContent = "Play";
  }

  els.npPrevious.disabled = !hasPrevious;
  els.npNextGem.disabled = poolSize === 0;

  if (playbackUi.mode === "loading" && (isPlaying || els.npPlayPause.textContent === "Pause")) {
    clearPlaybackMessage();
  }

  updateDigStatus();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "fetchProgress") showProgress(message);
  else if (message.action === "fetchComplete") showResults(message);
  else if (message.action === "fetchError") showError(message.error);
  else if (message.action === "playbackState") PlaybackController.handleRemoteState(message.state);
});

function getSeenSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_SEEN) || "[]"));
  } catch {
    return new Set();
  }
}

function getGemsSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_GEMS) || "[]"));
  } catch {
    return new Set();
  }
}

function saveGemsSet(set) {
  localStorage.setItem(STORAGE_GEMS, JSON.stringify([...set]));
}

function isGem(trackId) {
  return trackId != null && getGemsSet().has(String(trackId));
}

function toggleGem(trackId) {
  if (trackId == null) return;
  const gems = getGemsSet();
  const key = String(trackId);
  if (gems.has(key)) gems.delete(key);
  else {
    gems.add(key);
    sessionState.gemIds.add(key);
  }
  saveGemsSet(gems);
  updateGemsStat();
  updateSessionUi();
  applyFilters();
}

function getSessionTracks() {
  return state.allTracks.filter(
    (track) => track.id != null && sessionState.gemIds.has(String(track.id))
  );
}

function trackExportShape(track) {
  const artist = getArtistInfo(track);
  return {
    id: track.id,
    title: track.title ?? "",
    username: track.username ?? "",
    artist: artist.display ?? "",
    label_name: track.label_name ?? "",
    genre: track.genre ?? "",
    user_tags: getUserTagsForTrack(track.id),
    permalink_url: track.permalink_url ?? "",
    playback_count: track.playback_count ?? null,
    followers_count: track.followers_count ?? null,
    duration: track.duration ?? null,
    played_at: track.played_at ?? null,
  };
}

function countGemsInLibrary() {
  const gems = getGemsSet();
  return state.allTracks.filter((track) => track.id != null && gems.has(String(track.id))).length;
}

function getMyGemTracks() {
  const gems = getGemsSet();
  return state.allTracks.filter((track) => track.id != null && gems.has(String(track.id)));
}

function downloadTextFile(content, filename, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyTrackUrls(tracks, label) {
  const urls = tracks.map((track) => track.permalink_url).filter(Boolean);
  if (urls.length === 0) {
    showPlaybackError(`No ${label} URLs to copy`);
    return;
  }
  try {
    await navigator.clipboard.writeText(urls.join("\n"));
    showPlaybackStatus(`Copied ${urls.length} ${label} URLs`);
    setTimeout(() => clearPlaybackMessage(), 2500);
  } catch {
    showPlaybackError("Could not copy to clipboard");
  }
}

function exportSessionJson() {
  const tracks = getSessionTracks().map(trackExportShape);
  if (tracks.length === 0) {
    showPlaybackError("No session gems to export");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(JSON.stringify(tracks, null, 2), `session-gems-${stamp}.json`);
  showPlaybackStatus(`Exported ${tracks.length} session gems`);
  setTimeout(() => clearPlaybackMessage(), 2500);
}

function exportMyGemsJson() {
  const tracks = getMyGemTracks().map(trackExportShape);
  if (tracks.length === 0) {
    showPlaybackError("No saved gems to export");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(JSON.stringify(tracks, null, 2), `my-gems-${stamp}.json`);
  showPlaybackStatus(`Exported ${tracks.length} gems`);
  setTimeout(() => clearPlaybackMessage(), 2500);
}

async function copySessionUrls() {
  await copyTrackUrls(getSessionTracks(), "session");
}

async function copyMyGemsUrls() {
  await copyTrackUrls(getMyGemTracks(), "gem");
}

function clearSessionGems() {
  if (sessionState.gemIds.size === 0) return;
  if (!confirm("Clear all gems from this session? (My Gems are kept.)")) return;
  sessionState.gemIds.clear();
  if (state.activeTab === "session") setActiveTab("all");
  updateSessionUi();
  applyFilters();
}

function updateSessionUi() {
  const count = sessionState.gemIds.size;
  els.statSessionGems.textContent = formatNumber(count);
  els.sessionGemCount.textContent = formatNumber(count);
  els.tabSession.textContent = count > 0 ? `Session (${count})` : "Session";
  els.tabSession.classList.toggle("hidden", count === 0);
  els.sessionBar.classList.toggle("hidden", count === 0);
  updateStatsSummary();
}

function bindSessionControls() {
  els.sessionView.addEventListener("click", () => viewSessionGems());
  els.sessionExportJson.addEventListener("click", () => exportSessionJson());
  els.sessionCopyUrls.addEventListener("click", () => void copySessionUrls());
  els.sessionClear.addEventListener("click", () => clearSessionGems());
}

function bindBrowseControls() {
  const rerenderBrowse = () => {
    if (state.allTracks.length > 0) {
      renderBrowseLists(state.allTracks);
    }
  };

  [
    els.browseArtistsSearch,
    els.browseLabelsSearch,
    els.browseArtistsMin,
    els.browseLabelsMin,
  ].forEach((el) => {
    el.addEventListener("input", rerenderBrowse);
    el.addEventListener("change", rerenderBrowse);
  });

  els.browseArtistsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-artist-key]");
    if (btn) {
      const { key, display } = readArtistFromButton(btn);
      setArtistFilter(key, display);
    }
  });

  els.browseLabelsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-label-key]");
    if (btn) {
      const { key, display } = readLabelFromButton(btn);
      setLabelFilter(key, display);
    }
  });
}

function markSeen(trackId) {
  if (trackId == null) return;
  const seen = getSeenSet();
  seen.add(String(trackId));
  localStorage.setItem(STORAGE_SEEN, JSON.stringify([...seen]));
  updateSeenStat();
  applyFilters();
}

function isBuiltInPreset(name) {
  return name === BUILTIN_PRESET_NAME;
}

function migratePresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_PRESETS) || "[]");
    const cleaned = raw.filter(
      (p) => p?.name && !isBuiltInPreset(p.name) && !REMOVED_PRESET_NAMES.has(p.name)
    );
    if (cleaned.length !== raw.length) {
      localStorage.setItem(STORAGE_CUSTOM_PRESETS, JSON.stringify(cleaned));
    }
  } catch {
    localStorage.removeItem(STORAGE_CUSTOM_PRESETS);
  }
}

function getCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_CUSTOM_PRESETS) || "[]").filter(
      (p) => p?.name && !isBuiltInPreset(p.name) && !REMOVED_PRESET_NAMES.has(p.name)
    );
  } catch {
    return [];
  }
}

function saveCustomPresets(presets) {
  localStorage.setItem(
    STORAGE_CUSTOM_PRESETS,
    JSON.stringify(
      presets.filter(
        (p) => p?.name && !isBuiltInPreset(p.name) && !REMOVED_PRESET_NAMES.has(p.name)
      )
    )
  );
}

function getAllPresets() {
  return [DEFAULT_PRESET, ...getCustomPresets()];
}

function initPresets() {
  els.presetSelect.innerHTML = getAllPresets()
    .map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`)
    .join("");
  els.presetSelect.value = BUILTIN_PRESET_NAME;
}

function bindTabs() {
  els.tabAll.addEventListener("click", () => setActiveTab("all"));
  els.tabGems.addEventListener("click", () => setActiveTab("gems"));
  els.tabSession.addEventListener("click", () => setActiveTab("session"));
}

function viewSessionGems() {
  if (sessionState.gemIds.size === 0) return;
  setActiveTab("session");
  els.tableWrap?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setActiveTab(tab) {
  if (tab === "session" && sessionState.gemIds.size === 0) {
    tab = "all";
  }
  state.activeTab = tab;
  els.tabAll.classList.toggle("active", tab === "all");
  els.tabGems.classList.toggle("active", tab === "gems");
  els.tabSession.classList.toggle("active", tab === "session");
  els.sessionBar.classList.toggle("session-bar-active", tab === "session");
  els.gemsBar.classList.toggle("gems-bar-active", tab === "gems");
  els.sessionView.textContent = tab === "session" ? "Viewing session" : "View session gems";
  updateActiveFilterSummary();
  applyFilters();
}

function bindPresetActions() {
  els.presetSelect.addEventListener("change", () => {
    const preset = getAllPresets().find((p) => p.name === els.presetSelect.value);
    if (preset) applyPreset(preset, { syncDropdown: true });
  });

  els.savePreset.addEventListener("click", () => {
    const name = prompt("Preset name:");
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (isBuiltInPreset(trimmed)) {
      alert("The name \"Default\" is reserved.");
      return;
    }
    if (getAllPresets().some((p) => p.name === trimmed)) {
      alert("A preset with that name already exists.");
      return;
    }
    saveCustomPresets([...getCustomPresets(), { name: trimmed, ...captureCurrentFilters() }]);
    initPresets();
    els.presetSelect.value = trimmed;
    updatePresetDisplay();
  });

  els.renamePreset.addEventListener("click", () => {
    const name = els.presetSelect.value;
    if (isBuiltInPreset(name)) {
      alert("The Default preset cannot be renamed.");
      return;
    }
    const newName = prompt("Rename preset:", name);
    if (!newName?.trim() || newName.trim() === name) return;
    const trimmed = newName.trim();
    if (isBuiltInPreset(trimmed) || getCustomPresets().some((p) => p.name === trimmed)) {
      alert("That name is not available.");
      return;
    }
    saveCustomPresets(
      getCustomPresets().map((p) => (p.name === name ? { ...p, name: trimmed } : p))
    );
    initPresets();
    els.presetSelect.value = trimmed;
    updatePresetDisplay();
  });

  els.deletePreset.addEventListener("click", () => {
    const name = els.presetSelect.value;
    if (isBuiltInPreset(name)) {
      alert("The Default preset cannot be deleted.");
      return;
    }
    if (!confirm(`Delete preset "${name}"?`)) return;
    saveCustomPresets(getCustomPresets().filter((p) => p.name !== name));
    initPresets();
    applyPreset(DEFAULT_PRESET, { syncDropdown: true });
  });

  els.clearLabelFilter.addEventListener("click", () => clearLabelFilter());
  els.clearArtistFilter.addEventListener("click", () => clearArtistFilter());
  els.clearTagFilter.addEventListener("click", () => clearTagFilter());
  els.clearUserTagFilter.addEventListener("click", () => clearUserTagFilter());

  els.resetFilters.addEventListener("click", () => resetFilters());
}

function captureCurrentFilters() {
  return {
    maxPlays: Number(els.maxPlays.value),
    maxFollowers: Number(els.maxFollowers.value),
    maxDuration: Number(els.maxDuration.value),
    likedWithin: els.likedWithin.value,
    excludeMixes: els.excludeMixes.checked,
    excludePodcasts: els.excludePodcasts.checked,
    excludeLive: els.excludeLive.checked,
    hideSeen: els.hideSeen.checked,
    clipsFilter: els.clipsFilter.value,
  };
}

function filtersMatchPreset(preset) {
  if (!preset) return false;
  const current = captureCurrentFilters();
  return (
    current.maxPlays === preset.maxPlays &&
    current.maxFollowers === preset.maxFollowers &&
    current.maxDuration === preset.maxDuration &&
    current.likedWithin === (preset.likedWithin ?? "all") &&
    current.excludeMixes === !!preset.excludeMixes &&
    current.excludePodcasts === !!preset.excludePodcasts &&
    current.excludeLive === !!preset.excludeLive &&
    current.hideSeen === !!preset.hideSeen &&
    current.clipsFilter === (preset.clipsFilter ?? "any")
  );
}

function updatePresetDisplay() {
  if (state.isApplyingPreset) return;

  const selectedName = els.presetSelect.value;
  const preset = getAllPresets().find((p) => p.name === selectedName);
  const matchesSelected = filtersMatchPreset(preset);

  if (matchesSelected && preset) {
    els.currentPresetDisplay.textContent = preset.name;
  } else {
    els.currentPresetDisplay.textContent = "Custom (Unsaved)";
  }
}

function applyPreset(preset, { syncDropdown = false } = {}) {
  state.isApplyingPreset = true;
  els.maxPlays.value = preset.maxPlays;
  els.maxFollowers.value = preset.maxFollowers;
  els.maxDuration.value = preset.maxDuration;
  els.likedWithin.value = preset.likedWithin ?? "all";
  els.excludeMixes.checked = !!preset.excludeMixes;
  els.excludePodcasts.checked = !!preset.excludePodcasts;
  els.excludeLive.checked = !!preset.excludeLive;
  els.hideSeen.checked = !!preset.hideSeen;
  els.clipsFilter.value = preset.clipsFilter ?? "any";
  if (syncDropdown) els.presetSelect.value = preset.name;
  updateSliderOutputs();
  state.isApplyingPreset = false;
  updatePresetDisplay();
  updateActiveFilterSummary();
  applyFilters();
}

function resetFilters() {
  state.labelFilter = null;
  state.labelFilterDisplay = null;
  state.artistFilter = null;
  state.artistFilterDisplay = null;
  state.tagFilter = null;
  state.tagFilterDisplay = null;
  state.userTagFilter = null;
  state.userTagFilterDisplay = null;
  state.searchQuery = "";
  els.trackSearch.value = "";
  updateActiveLabelBar();
  updateActiveArtistBar();
  updateActiveTagBar();
  updateActiveUserTagBar();
  applyPreset(DEFAULT_PRESET, { syncDropdown: true });
}

function bindFilterInputs() {
  [
    els.maxPlays, els.maxFollowers, els.maxDuration, els.likedWithin,
    els.excludeMixes, els.excludePodcasts, els.excludeLive, els.hideSeen,
  ].forEach((el) => {
    el.addEventListener("input", () => {
      updateSliderOutputs();
      updatePresetDisplay();
      updateActiveFilterSummary();
      updateClipsUi();
      applyFilters();
    });
  });
}

function bindSortHeaders() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "title" || key === "username" || key === "label_name"
          ? "asc"
          : key === "liked_age" || key === "played_at"
            ? "desc"
            : "desc";
      }
      applyFilters();
    });
  });
}

function bindTableActions() {
  els.topLabelsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-label-key]");
    if (btn) {
      const { key, display } = readLabelFromButton(btn);
      setLabelFilter(key, display);
    }
  });

  els.topTagsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-tag-key]");
    if (btn) {
      const { key, display } = readTagFromButton(btn);
      setTagFilter(key, display);
    }
  });

  els.myTagsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-user-tag-key]");
    if (btn) {
      const { key, display } = readUserTagFromButton(btn);
      setUserTagFilter(key, display);
    }
  });

  els.topArtistsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-artist-key]");
    if (btn) {
      const { key, display } = readArtistFromButton(btn);
      setArtistFilter(key, display);
    }
  });

  els.tracksBody.addEventListener("click", (event) => {
    const playBtn = event.target.closest("[data-play-track]");
    if (playBtn) {
      const trackId = playBtn.dataset.trackId;
      const track = state.filteredTracks.find((t) => String(t.id) === String(trackId));
      if (track) playTrackFromPanel(track);
      return;
    }

    const findFullBtn = event.target.closest("[data-find-full]");
    if (findFullBtn) {
      const trackId = findFullBtn.dataset.trackId;
      const track =
        state.filteredTracks.find((t) => String(t.id) === String(trackId)) ||
        state.allTracks.find((t) => String(t.id) === String(trackId));
      if (track) void handleFindFullVersion(track);
      return;
    }

    const star = event.target.closest("[data-toggle-gem]");
    if (star) {
      toggleGem(star.dataset.trackId);
      return;
    }

    const artistBtn = event.target.closest("[data-artist-key]");
    if (artistBtn) {
      const { key, display } = readArtistFromButton(artistBtn);
      setArtistFilter(key, display);
      return;
    }

    const labelBtn = event.target.closest("[data-label-key]");
    if (labelBtn) {
      const { key, display } = readLabelFromButton(labelBtn);
      setLabelFilter(key, display);
      return;
    }

    const addUserTagBtn = event.target.closest("[data-add-user-tag]");
    if (addUserTagBtn) {
      const trackId = addUserTagBtn.dataset.trackId;
      const raw = prompt("Add tag:");
      const trimmed = String(raw ?? "").trim();
      if (!trimmed) return;
      addUserTag(trackId, trimmed);
      applyFilters();
      return;
    }

    const removeUserTagBtn = event.target.closest("[data-remove-user-tag]");
    if (removeUserTagBtn) {
      removeUserTag(removeUserTagBtn.dataset.trackId, removeUserTagBtn.dataset.userTagKey);
      applyFilters();
      return;
    }

    const userTagBtn = event.target.closest(".user-tag-filter");
    if (userTagBtn) {
      const { key, display } = readUserTagFromButton(userTagBtn);
      setUserTagFilter(key, display);
      return;
    }

    const link = event.target.closest("[data-open-track]");
    if (link?.dataset.trackId) markSeen(link.dataset.trackId);
  });
}

function getFilters() {
  return {
    maxPlays: Number(els.maxPlays.value),
    maxFollowers: Number(els.maxFollowers.value),
    maxDurationMs: Number(els.maxDuration.value) * 60 * 1000,
    likedWithin: els.likedWithin.value,
    excludeMixes: els.excludeMixes.checked,
    excludePodcasts: els.excludePodcasts.checked,
    excludeLive: els.excludeLive.checked,
    hideSeen: els.hideSeen.checked,
    clipsFilter: els.clipsFilter.value,
  };
}

function buildActiveFilterSummaryItems() {
  const items = [];

  if (state.labelFilter) {
    items.push(`Label: ${state.labelFilterDisplay ?? state.labelFilter}`);
  }
  if (state.artistFilter) {
    items.push(`Artist: ${state.artistFilterDisplay ?? state.artistFilter}`);
  }
  if (state.tagFilter) {
    items.push(`SC tag: ${state.tagFilterDisplay ?? state.tagFilter}`);
  }
  if (state.userTagFilter) {
    items.push(`My tag: ${state.userTagFilterDisplay ?? state.userTagFilter}`);
  }
  if (state.searchQuery) {
    items.push(`Search: "${state.searchQuery}"`);
  }

  const f = getFilters();
  items.push(
    `Plays ≤ ${formatNumber(f.maxPlays)}`,
    `Followers ≤ ${formatNumber(f.maxFollowers)}`,
    `Duration ≤ ${els.maxDuration.value} min`
  );

  if (f.likedWithin !== "all" && LIKED_WITHIN_LABELS[f.likedWithin]) {
    items.push(LIKED_WITHIN_LABELS[f.likedWithin]);
  }

  if (f.excludeMixes) items.push("Exclude DJ Mixes");
  if (f.excludePodcasts) items.push("Exclude Podcasts");
  if (f.excludeLive) items.push("Exclude Live Sets");
  if (f.hideSeen) items.push("Hide Seen Tracks");
  if (f.clipsFilter === "hide") items.push("Hide Clips & Snippets");
  if (f.clipsFilter === "only") items.push("Clips & Snippets only");
  if (state.activeTab === "gems") items.push("My Gems only");
  if (state.activeTab === "session") items.push("Session gems only");

  return items;
}

function updateActiveFilterSummary() {
  const items = buildActiveFilterSummaryItems();
  els.activeFilterList.innerHTML = items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function updateActiveUserTagBar() {
  if (state.userTagFilter) {
    els.userTagFilterName.textContent = state.userTagFilterDisplay ?? state.userTagFilter;
    els.activeUserTagBar.classList.remove("hidden");
  } else {
    els.activeUserTagBar.classList.add("hidden");
  }
}

function updateActiveTagBar() {
  if (state.tagFilter) {
    els.tagFilterName.textContent = state.tagFilterDisplay ?? state.tagFilter;
    els.activeTagBar.classList.remove("hidden");
  } else {
    els.activeTagBar.classList.add("hidden");
  }
}

function updateActiveArtistBar() {
  if (state.artistFilter) {
    els.artistFilterName.textContent = state.artistFilterDisplay ?? state.artistFilter;
    els.activeArtistBar.classList.remove("hidden");
  } else {
    els.activeArtistBar.classList.add("hidden");
  }
}

function updateActiveLabelBar() {
  if (state.labelFilter) {
    els.labelFilterName.textContent = state.labelFilterDisplay ?? state.labelFilter;
    els.activeLabelBar.classList.remove("hidden");
  } else {
    els.activeLabelBar.classList.add("hidden");
  }
}

function searchText(track) {
  const artist = getArtistInfo(track);
  return [
    track.title,
    track.genre,
    track.tag_list,
    artist.display,
    artist.uploader,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesKeywords(text, keywords) {
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

function isDjSet(track) {
  const text = searchText(track);
  if (DJ_SET_SAFE.some((safe) => text.includes(safe))) return false;
  return matchesKeywords(text, DJ_SET_KEYWORDS);
}

function isPodcast(track) {
  return matchesKeywords(searchText(track), PODCAST_KEYWORDS);
}

function isLiveSet(track) {
  const text = searchText(track);
  if (/\blive set\b/.test(text)) return true;
  if (/\bboiler room\b/.test(text)) return true;
  if (/\brecorded live\b/.test(text)) return true;
  return /\blive\b/.test(text) && !/\balive\b/.test(text) && !/\beliver\b/.test(text);
}

function parseDate(value) {
  if (!value) return null;
  const normalized = String(value).replace(/(\d{4})\/(\d{2})\/(\d{2})/, "$1-$2-$3");
  const ts = Date.parse(normalized);
  return Number.isFinite(ts) ? ts : null;
}

function passesDateFilter(playedAt, filterValue) {
  if (!filterValue || filterValue === "all") return true;
  const ts = parseDate(playedAt);
  if (!ts) return false;

  if (filterValue.startsWith("older")) {
    const days = Number(filterValue.replace("older", ""));
    const cutoff = Date.now() - days * 86400000;
    return ts <= cutoff;
  }

  const days = Number(filterValue);
  const cutoff = Date.now() - days * 86400000;
  return ts >= cutoff;
}

function getSourceTracks() {
  if (state.activeTab === "session") {
    return state.allTracks.filter(
      (t) => t.id != null && sessionState.gemIds.has(String(t.id))
    );
  }
  if (state.activeTab === "gems") {
    const gems = getGemsSet();
    return state.allTracks.filter((t) => t.id != null && gems.has(String(t.id)));
  }
  return state.allTracks;
}

function passesPresetFilters(track, f, seen) {
  if (!passesMaxMetric(track.playback_count, f.maxPlays)) return false;
  if (!passesMaxMetric(track.followers_count, f.maxFollowers)) return false;
  if (track.duration > 0 && track.duration > f.maxDurationMs) return false;
  if (!passesDateFilter(track.played_at, f.likedWithin)) return false;
  if (f.excludeMixes && isDjSet(track)) return false;
  if (f.excludePodcasts && isPodcast(track)) return false;
  if (f.excludeLive && isLiveSet(track)) return false;
  if (f.hideSeen && track.id != null && seen.has(String(track.id))) return false;

  const clip = isClipOrSnippet(track);
  if (f.clipsFilter === "hide" && clip) return false;
  if (f.clipsFilter === "only" && !clip) return false;

  return true;
}

function filterTracks(tracks) {
  const f = getFilters();
  const seen = getSeenSet();

  return tracks.filter((track) => {
    if (!matchesSearchQuery(track, state.searchQuery)) return false;

    if (state.tagFilter && !trackHasTag(track, state.tagFilter)) return false;
    if (state.userTagFilter && !trackHasUserTag(track, state.userTagFilter)) return false;

    if (state.activeTab === "session" || state.activeTab === "gems") {
      if (state.labelFilter && getTrackLabelInfo(track).key !== state.labelFilter) return false;
      if (state.artistFilter && getArtistInfo(track).key !== state.artistFilter) return false;
      return true;
    }

    if (state.labelFilter && getTrackLabelInfo(track).key !== state.labelFilter) return false;
    if (state.artistFilter && getArtistInfo(track).key !== state.artistFilter) return false;

    return passesPresetFilters(track, f, seen);
  });
}

function passesMaxMetric(value, max) {
  if (value == null) return true;
  if (!Number.isFinite(max)) return true;
  return value <= max;
}

function likedAgeMs(playedAt) {
  const ts = parseDate(playedAt);
  return ts == null ? null : Date.now() - ts;
}

function sortValue(track, key) {
  if (key === "title") return (track.title ?? "").toLowerCase();
  if (key === "username") return (track.username ?? "").toLowerCase();
  if (key === "label_name") return normalizeLabel(getTrackLabelRaw(track));
  if (key === "played_at") return parseDate(track.played_at);
  if (key === "liked_age") return likedAgeMs(track.played_at);
  if (key === "duration") return track.duration ?? 0;
  const value = track[key];
  return value == null ? null : value;
}

function sortTracks(tracks) {
  const { sortKey, sortDir } = state;
  const dir = sortDir === "asc" ? 1 : -1;

  return [...tracks].sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

function computeGroupedBy(tracks, getInfoFn) {
  const groups = new Map();

  for (const track of tracks) {
    const { key, display } = getInfoFn(track);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, { count: 0, displays: new Map() });
    }
    const group = groups.get(key);
    group.count += 1;
    group.displays.set(display, (group.displays.get(display) || 0) + 1);
  }

  return [...groups.entries()]
    .map(([key, { count, displays }]) => {
      const display = [...displays.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { key, display, count };
    })
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
}

function computeTopLabels(tracks) {
  return computeGroupedBy(tracks, getTrackLabelInfo);
}

function computeTopArtists(tracks) {
  return computeGroupedBy(tracks, getArtistInfo);
}

function filterBrowseItems(items, { searchQuery, minCount }) {
  const query = (searchQuery ?? "").trim().toLowerCase();
  const min = Number(minCount) || 1;

  return items.filter((item) => {
    if (item.count < min) return false;
    if (query && !item.display.toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderBrowseList(container, items, { activeKey, keyAttr, displayAttr }) {
  if (items.length === 0) {
    container.innerHTML = '<p class="muted-inline">No matches.</p>';
    return;
  }

  container.innerHTML = items
    .map(({ key, display, count }) => {
      const active =
        activeKey === key
          ? keyAttr === "data-artist-key"
            ? " label-stat-active"
            : " label-stat-active"
          : "";
      return `<button type="button" class="label-stat browse-item${active}" ${keyAttr}="${escapeHtml(key)}" ${displayAttr}="${escapeHtml(display)}">
          <span class="label-stat-name">${escapeHtml(display)}</span>
          <span class="label-stat-count">${formatNumber(count)}</span>
        </button>`;
    })
    .join("");
}

function renderBrowseLists(tracks) {
  const allLabels = computeTopLabels(tracks);
  const allArtists = computeTopArtists(tracks);

  els.browseLabelsSummary.textContent = `All Labels (${formatNumber(allLabels.length)})`;
  els.browseArtistsSummary.textContent = `All Artists (${formatNumber(allArtists.length)})`;

  renderBrowseList(
    els.browseLabelsList,
    filterBrowseItems(allLabels, {
      searchQuery: els.browseLabelsSearch.value,
      minCount: els.browseLabelsMin.value,
    }),
    {
      activeKey: state.labelFilter,
      keyAttr: "data-label-key",
      displayAttr: "data-label-display",
    }
  );

  renderBrowseList(
    els.browseArtistsList,
    filterBrowseItems(allArtists, {
      searchQuery: els.browseArtistsSearch.value,
      minCount: els.browseArtistsMin.value,
    }),
    {
      activeKey: state.artistFilter,
      keyAttr: "data-artist-key",
      displayAttr: "data-artist-display",
    }
  );
}

function renderTopArtists(tracks) {
  const top = computeTopArtists(tracks).slice(0, 12);
  if (top.length === 0) {
    els.topArtistsList.innerHTML = '<p class="muted-inline">No artists in loaded tracks.</p>';
    return;
  }

  els.topArtistsList.innerHTML = top
    .map(({ key, display, count }) => {
      const active = state.artistFilter === key ? " label-stat-active" : "";
      return `<button type="button" class="label-stat${active}" data-artist-key="${escapeHtml(key)}" data-artist-display="${escapeHtml(display)}">
          <span class="label-stat-name">${escapeHtml(display)}</span>
          <span class="label-stat-count">${formatNumber(count)} tracks</span>
        </button>`;
    })
    .join("");
}

function computeTopTags(tracks) {
  const groups = new Map();

  for (const track of tracks) {
    for (const { key, display } of parseTrackTags(track)) {
      if (!groups.has(key)) {
        groups.set(key, { count: 0, displays: new Map() });
      }
      const group = groups.get(key);
      group.count += 1;
      group.displays.set(display, (group.displays.get(display) || 0) + 1);
    }
  }

  return [...groups.entries()]
    .map(([key, { count, displays }]) => {
      const display = [...displays.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { key, display, count };
    })
    .sort((a, b) => b.count - a.count);
}

function renderMyTags(tracks) {
  const top = computeTopUserTags(tracks);
  els.myTagsSummary.textContent = `My Tags (${formatNumber(top.length)})`;

  if (top.length === 0) {
    els.myTagsList.innerHTML =
      '<p class="muted-inline">No custom tags yet — click + in the table to add tags.</p>';
    return;
  }

  els.myTagsList.innerHTML = top
    .map(({ key, display, count }) => {
      const active = state.userTagFilter === key ? " user-tag-chip-active" : "";
      return `<button type="button" class="user-tag-chip user-tag-chip-list${active}" data-user-tag-key="${escapeHtml(key)}" data-user-tag-display="${escapeHtml(display)}">
          <span class="user-tag-chip-name">${escapeHtml(display)}</span>
          <span class="user-tag-chip-count">${formatNumber(count)}</span>
        </button>`;
    })
    .join("");
}

function renderTopTags(tracks) {
  const top = computeTopTags(tracks).slice(0, 16);
  if (top.length === 0) {
    els.topTagsList.innerHTML = '<p class="muted-inline">No genres or tags in loaded tracks.</p>';
    return;
  }

  els.topTagsList.innerHTML = top
    .map(({ key, display, count }) => {
      const active = state.tagFilter === key ? " tag-chip-active" : "";
      return `<button type="button" class="tag-chip${active}" data-tag-key="${escapeHtml(key)}" data-tag-display="${escapeHtml(display)}">
          <span class="tag-chip-name">${escapeHtml(display)}</span>
          <span class="tag-chip-count">${formatNumber(count)}</span>
        </button>`;
    })
    .join("");
}

function renderTopLabels(tracks) {
  const top = computeTopLabels(tracks).slice(0, 12);
  if (top.length === 0) {
    els.topLabelsList.innerHTML = '<p class="muted-inline">No labels in loaded tracks.</p>';
    return;
  }
  els.topLabelsList.innerHTML = top
    .map(({ key, display, count }) => {
      const active = state.labelFilter === key ? " label-stat-active" : "";
      return `<button type="button" class="label-stat${active}" data-label-key="${escapeHtml(key)}" data-label-display="${escapeHtml(display)}">
          <span class="label-stat-name">${escapeHtml(display)}</span>
          <span class="label-stat-count">${formatNumber(count)} tracks</span>
        </button>`;
    })
    .join("");
}

function updateEmptyResultsUi(matchingCount) {
  const isEmpty = matchingCount === 0;

  els.statAvgPlaysWrap.classList.toggle("hidden", isEmpty);
  els.statAvgFollowersWrap.classList.toggle("hidden", isEmpty);
  els.topLabels.classList.toggle("hidden", isEmpty);
  els.topArtists.classList.toggle("hidden", isEmpty);
  els.topTags.classList.toggle("hidden", isEmpty);
  els.browseLabels.classList.toggle("hidden", isEmpty);
  els.browseArtists.classList.toggle("hidden", isEmpty);
  els.noMatchesNotice.classList.toggle("hidden", !isEmpty);
}

function updateStatsSummary() {
  const parts = [
    `${formatNumber(state.allTracks.length)} total`,
    `${formatNumber(getGemsSet().size)} gems`,
  ];
  const clips = countClips(state.allTracks);
  if (clips > 0) parts.push(`${formatNumber(clips)} clips`);
  if (sessionState.gemIds.size > 0) {
    parts.push(`${formatNumber(sessionState.gemIds.size)} session`);
  }

  els.statsSummary.textContent = parts.join(" · ");
}

function applyFilters() {
  if (state.allTracks.length === 0) return;

  const source = getSourceTracks();
  const filtered = sortTracks(filterTracks(source));
  const matchingCount = filtered.length;

  state.filteredTracks = filtered;
  PlaybackController.setFilteredPool(filtered);

  els.statTotal.textContent = formatNumber(state.allTracks.length);
  els.statMatching.textContent = formatNumber(matchingCount);
  els.statUnseen.textContent = formatNumber(countUnseenInFilter());

  const knownPlays = filtered.map((t) => t.playback_count).filter((v) => v != null);
  const knownFollowers = filtered.map((t) => t.followers_count).filter((v) => v != null);
  const avgPlays = average(knownPlays);
  const avgFollowers = average(knownFollowers);

  els.statAvgPlays.textContent = avgPlays == null ? "N/A" : formatNumber(Math.round(avgPlays));
  els.statAvgFollowers.textContent =
    avgFollowers == null ? "N/A" : formatNumber(Math.round(avgFollowers));

  updateSeenStat();
  updateGemsStat();
  updateActiveLabelBar();
  updateActiveArtistBar();
  updateActiveTagBar();
  updateActiveUserTagBar();
  updateClipsUi();
  updateSessionUi();
  updateStatsSummary();
  updateEmptyResultsUi(matchingCount);
  updateSortHeaders();
  renderTopTags(state.allTracks);
  renderMyTags(state.allTracks);
  renderTopArtists(state.allTracks);
  renderTopLabels(state.allTracks);
  renderBrowseLists(state.allTracks);
  renderTable(filtered);
  updateDigStatus();
  PlaybackController.notify();
}

function updateSeenStat() {
  els.statSeen.textContent = formatNumber(getSeenSet().size);
}

function updateGemsBar() {
  const count = getGemsSet().size;
  els.gemsBarCount.textContent = formatNumber(count);
  els.gemsBar.classList.toggle("hidden", count === 0);
}

function updateGemsStat() {
  els.statGems.textContent = formatNumber(getGemsSet().size);
  updateGemsBar();
}

function bindGemsControls() {
  els.gemsExportJson.addEventListener("click", () => exportMyGemsJson());
  els.gemsCopyUrls.addEventListener("click", () => void copyMyGemsUrls());
}

function bindOnboarding() {
  els.openSoundCloud.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://soundcloud.com/you/likes" });
  });
  els.onboardingLoad.addEventListener("click", () => {
    void requestFetchFromActiveTab({ force: true });
  });
  if (els.privacyLink) {
    els.privacyLink.href = PRIVACY_POLICY_URL;
  }
}

function showOnboarding() {
  els.onboarding.classList.remove("hidden");
}

function hideOnboarding() {
  els.onboarding.classList.add("hidden");
}

function updateSortHeaders() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-active", "sort-asc", "sort-desc");
    if (th.dataset.sort === state.sortKey) {
      th.classList.add("sort-active", state.sortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

async function requestFetchFromActiveTab({ force = false } = {}) {
  if (state.fetchInProgress) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("soundcloud.com")) {
    if (!state.allTracks.length) {
      showOnboarding();
      els.status.classList.add("hidden");
    }
    return;
  }

  hideOnboarding();
  state.fetchInProgress = true;
  els.refreshLikes.disabled = true;

  if (force || !state.allTracks.length) {
    els.status.textContent = "Loading your likes…";
    els.status.classList.remove("hidden");
  }

  chrome.tabs.sendMessage(tab.id, { action: "fetchLikes" }).catch(() => {
    if (!state.allTracks.length) {
      showOnboarding();
      els.status.textContent = "Reload soundcloud.com, then click Load likes.";
      els.status.classList.remove("hidden");
    }
    state.fetchInProgress = false;
    els.refreshLikes.disabled = false;
  });
}

function finishFetchUi() {
  state.fetchInProgress = false;
  els.refreshLikes.disabled = false;
}

function showProgress(message) {
  hideError();
  hideOnboarding();
  els.status.classList.add("hidden");
  if (!state.allTracks.length) {
    els.mainUi.classList.add("hidden");
  }
  els.progressWrap.classList.remove("hidden");
  if (message.user?.username) els.userLabel.textContent = `@${message.user.username}`;

  const labels = {
    auth: "Reading SoundCloud session…",
    user: "Detecting current user…",
    discover: "Finding likes API endpoint…",
    loading: `Loaded ${formatNumber(message.loaded)} liked tracks…`,
    processing: `Processing ${formatNumber(message.loaded)} liked tracks…`,
  };
  els.progressText.textContent = labels[message.phase] ?? "Loading…";
  els.progressFill.style.width =
    message.phase === "loading" || message.phase === "processing"
      ? `${Math.min(95, 20 + Math.log10(message.loaded + 1) * 25)}%`
      : "12%";
}

function showResults(message, { fromCache = false, cachedAt = null } = {}) {
  finishFetchUi();
  hideOnboarding();
  els.progressWrap.classList.add("hidden");
  els.mainUi.classList.remove("hidden");
  els.status.classList.add("hidden");
  hideError();
  if (message.user?.username) els.userLabel.textContent = `@${message.user.username}`;

  state.allTracks = message.tracks ?? [];
  state.cacheLoadedAt = fromCache ? cachedAt ?? Date.now() : Date.now();
  updateCacheInfo();

  if (!fromCache) {
    void saveLikesCache(message);
  }

  applyFilters();
}

function renderTable(tracks) {
  if (tracks.length === 0) {
    let message = "No tracks match current filters.";
    if (state.activeTab === "gems") {
      const savedCount = getGemsSet().size;
      const inLibrary = countGemsInLibrary();
      if (savedCount === 0) {
        message = "No tracks in My Gems yet — star tracks on the All Tracks tab.";
      } else if (inLibrary === 0) {
        message = `${formatNumber(savedCount)} saved gem(s) not found in loaded likes — click Refresh.`;
      } else {
        message = "No gems match current search or tag filters.";
      }
    } else if (state.activeTab === "session") {
      message = "No gems in this session yet — star tracks while digging.";
    } else if (state.labelFilter) {
      message = `No tracks found for label "${state.labelFilterDisplay ?? state.labelFilter}".`;
    } else if (state.artistFilter) {
      message = `No tracks found for artist "${state.artistFilterDisplay ?? state.artistFilter}".`;
    } else if (state.userTagFilter) {
      message = `No tracks found for my tag "${state.userTagFilterDisplay ?? state.userTagFilter}".`;
    } else if (state.tagFilter) {
      message = `No tracks found for SC tag "${state.tagFilterDisplay ?? state.tagFilter}".`;
    } else if (state.searchQuery) {
      message = `No tracks match search "${state.searchQuery}".`;
    } else if (els.clipsFilter.value === "only") {
      message = "No clips or snippets match current filters.";
    }
    els.tracksBody.innerHTML =
      `<tr><td colspan="13" class="empty-row">${escapeHtml(message)}</td></tr>`;
    return;
  }

  els.tracksBody.innerHTML = tracks
    .map((track) => {
      const gem = isGem(track.id);
      const sessionGem = sessionState.gemIds.has(String(track.id));
      const { key, display } = getTrackLabelInfo(track);
      const { key: artistKey, display: artistDisplay, isPremierePost, uploader } =
        getArtistInfo(track);
      const labelActive = state.labelFilter && key === state.labelFilter ? " label-link-active" : "";
      const artistActive = state.artistFilter && artistKey === state.artistFilter ? " label-link-active" : "";
      const isCurrent = PlaybackController.isCurrentTrack(track.id);
      const isPlaying = isCurrent && PlaybackController.isPlaying;
      const rowClass = isCurrent ? "row-playing" : "";
      const playLabel = isPlaying ? "Pause" : "Play";
      const playIcon = isPlaying ? "⏸" : "▶";
      const isClip = isClipOrSnippet(track);
      const clipBadge = isClip
        ? '<span class="clip-badge" title="Clip, snippet, or preview">Preview</span> '
        : "";
      const premiereBadge = isPremierePost
        ? '<span class="premiere-badge" title="Premiere channel post">Premiere</span> '
        : "";
      const findFullBtn = isClip
        ? `<button type="button" class="find-full-btn" data-find-full data-track-id="${escapeHtml(track.id ?? "")}">Find full</button> `
        : "";
      const sessionBadge = sessionGem
        ? '<span class="session-badge" title="Starred this session">Session</span> '
        : "";
      const viaChannel =
        isPremierePost && uploader && normalizeChannelKey(uploader) !== artistKey
          ? `<span class="via-channel">via ${escapeHtml(uploader)}</span>`
          : "";
      return `<tr class="${rowClass}" data-track-row="${escapeHtml(track.id ?? "")}">
        <td class="col-star">
          <button type="button" class="star-btn ${gem ? "star-active" : ""}" data-toggle-gem data-track-id="${escapeHtml(track.id ?? "")}" aria-label="${gem ? "Remove from My Gems" : "Add to My Gems"}">${gem ? "★" : "☆"}</button>
        </td>
        <td class="title">${isPlaying ? '<span class="playing-indicator">Playing</span> ' : ""}${sessionBadge}${premiereBadge}${clipBadge}${findFullBtn}${escapeHtml(track.title)}</td>
        <td class="artist">${artistKey ? `<button type="button" class="label-link${artistActive}" data-artist-key="${escapeHtml(artistKey)}" data-artist-display="${escapeHtml(artistDisplay)}">${escapeHtml(artistDisplay)}</button>${viaChannel}` : "—"}</td>
        <td class="label">${key ? `<button type="button" class="label-link${labelActive}" data-label-key="${escapeHtml(key)}" data-label-display="${escapeHtml(display)}">${escapeHtml(display)}</button>` : "—"}</td>
        ${renderUserTagsCell(track)}
        <td class="num">${formatMetric(track.playback_count)}</td>
        <td class="num">${formatMetric(track.likes_count)}</td>
        <td class="num">${formatMetric(track.followers_count)}</td>
        <td class="num">${formatDurationMin(track.duration)}</td>
        <td class="num">${formatDateLiked(track.played_at)}</td>
        <td class="num">${formatLikedAge(track.played_at)}</td>
        <td class="col-play">
          <button type="button" class="play-btn ${isPlaying ? "play-btn-active" : ""}" data-play-track data-track-id="${escapeHtml(track.id ?? "")}" aria-label="${playLabel}">${playIcon}</button>
        </td>
        <td><a href="${escapeHtml(track.permalink_url)}" target="_blank" rel="noopener" data-open-track data-track-id="${escapeHtml(track.id ?? "")}">Open</a></td>
      </tr>`;
    })
    .join("");
}

function showError(text) {
  finishFetchUi();
  els.progressWrap.classList.add("hidden");
  if (!state.allTracks.length) {
    els.mainUi.classList.add("hidden");
    els.status.classList.add("hidden");
  }
  els.error.textContent = text;
  els.error.classList.remove("hidden");
}

function hideError() {
  els.error.classList.add("hidden");
  els.error.textContent = "";
}

function updateSliderOutputs() {
  els.playsOut.textContent = formatNumber(Number(els.maxPlays.value));
  els.followersOut.textContent = formatNumber(Number(els.maxFollowers.value));
  els.durationOut.textContent = els.maxDuration.value;
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function formatMetric(value) {
  return value == null ? "N/A" : formatNumber(value);
}

function formatDurationMin(ms) {
  if (!ms) return "N/A";
  const mins = ms / 60000;
  return mins < 10 ? mins.toFixed(1) : String(Math.round(mins));
}

function formatDateLiked(value) {
  const ts = parseDate(value);
  if (!ts) return "N/A";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatLikedAge(value) {
  const ts = parseDate(value);
  if (!ts) return "N/A";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? "1 year ago" : `${years} years ago`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  if (days <= 0) return "Today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
