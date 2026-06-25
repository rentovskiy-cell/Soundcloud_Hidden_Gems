/**
 * Side panel playback controller.
 * Routes commands to the SoundCloud tab and syncs UI state.
 * Designed for future queue, auto-dig, BPM, and related-track features.
 */
const PlaybackController = {
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  filteredPool: [],
  history: [],
  pollTimer: null,
  onStateChange: null,

  init(onStateChange) {
    this.onStateChange = onStateChange;
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "playbackState") {
        this.handleRemoteState(message.state);
      }
    });
    this.startPolling();
  },

  setFilteredPool(tracks) {
    this.filteredPool = tracks ?? [];
  },

  trackRef(track) {
    return {
      id: track.id,
      title: track.title ?? "",
      username: track.username ?? "",
      permalink_url: track.permalink_url ?? "",
    };
  },

  async sendCommand(command, payload = {}) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "playbackCommand",
        command,
        payload,
      });
      return response ?? { ok: false, error: "No response from SoundCloud tab" };
    } catch (error) {
      return { ok: false, error: error.message ?? String(error) };
    }
  },

  async playTrack(track, { addToHistory = true } = {}) {
    if (!track?.permalink_url) return { ok: false, error: "Missing track URL" };

    if (addToHistory && this.currentTrack && this.currentTrack.id !== track.id) {
      this.history.push(this.trackRef(this.currentTrack));
      if (this.history.length > 50) this.history.shift();
    }

    const result = await this.sendCommand("playTrack", { track: this.trackRef(track) });
    if (result.ok) {
      this.currentTrack = this.trackRef(track);
      this.isPlaying = result.state?.isPlaying === true
        ? true
        : result.pending
          ? false
          : result.state?.isPlaying !== false;
      this.notify();
      if (result.pending) {
        this.schedulePendingPoll();
      } else if (!this.isPlaying) {
        await this.pollPlayerState();
      }
    }
    return result;
  },

  async togglePlayback() {
    const result = await this.sendCommand("togglePlayback");
    if (result.ok && result.state) {
      this.isPlaying = !!result.state.isPlaying;
      this.notify();
    }
    return result;
  },

  async playPrevious() {
    const prev = this.history.pop();
    if (!prev) return { ok: false, error: "No previous track" };
    return this.playTrack(prev, { addToHistory: false });
  },

  async playNextGem(markSeenFn) {
    if (this.filteredPool.length === 0) {
      return { ok: false, error: "No tracks match current filters" };
    }
    const index = Math.floor(Math.random() * this.filteredPool.length);
    const track = this.filteredPool[index];
    const result = await this.playTrack(track, { addToHistory: true, markSeen: true });
    if (result.ok && markSeenFn) markSeenFn(track.id);
    return result;
  },

  isCurrentTrack(trackId) {
    return trackId != null && this.currentTrack?.id != null &&
      String(this.currentTrack.id) === String(trackId);
  },

  handleRemoteState(state) {
    if (!state) return;

    this.isPlaying = !!state.isPlaying;
    this.currentTime = Number(state.currentTime) || 0;
    this.duration = Number(state.duration) || 0;

    if (state.permalink) {
      const fromPool = this.filteredPool.find((t) =>
        this.permalinksMatch(t.permalink_url, state.permalink)
      );
      if (fromPool) {
        this.currentTrack = this.trackRef(fromPool);
      } else if (
        this.currentTrack &&
        this.permalinksMatch(state.permalink, this.currentTrack.permalink_url)
      ) {
        this.currentTrack = {
          ...this.currentTrack,
          title: state.title || this.currentTrack.title,
          username: state.artist || this.currentTrack.username,
        };
      } else if (state.title) {
        this.currentTrack = {
          id: this.currentTrack?.id ?? null,
          title: state.title,
          username: state.artist || "",
          permalink_url: state.permalink,
        };
      }
    }

    this.notify();
  },

  async pollPlayerState() {
    const result = await this.sendCommand("getPlayerState");
    if (result.ok && result.state) {
      this.handleRemoteState(result.state);
    }
  },

  schedulePendingPoll() {
    [300, 800, 1500, 3000].forEach((ms) => {
      setTimeout(() => this.pollPlayerState(), ms);
    });
  },

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.pollPlayerState(), 2000);
  },

  permalinksMatch(a, b) {
    try {
      const pa = new URL(a).pathname.replace(/\/$/, "");
      const pb = new URL(b).pathname.replace(/\/$/, "");
      return pa === pb;
    } catch {
      return a === b;
    }
  },

  notify() {
    if (typeof this.onStateChange === "function") {
      this.onStateChange({
        currentTrack: this.currentTrack,
        isPlaying: this.isPlaying,
        currentTime: this.currentTime,
        duration: this.duration,
        hasPrevious: this.history.length > 0,
        poolSize: this.filteredPool.length,
      });
    }
  },
};
