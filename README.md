# SoundCloud Hidden Gems

Chrome extension for DJs and diggers: filter your SoundCloud likes, preview tracks, and build a crate of hidden gems.

**Unofficial tool — not affiliated with SoundCloud.**

![Version](https://img.shields.io/badge/version-2.0.0-orange)

## Quick start

1. Clone this repo
2. Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked**
3. Select the `chrome-extension/` folder
4. Sign in at [soundcloud.com](https://soundcloud.com)
5. Open the side panel → **Load likes**

## Features

### Dig & filter
| Feature | Description |
|---------|-------------|
| **Presets** | Save/load filter combinations (plays, followers, duration, etc.) |
| **Max Plays / Followers** | Find underground tracks below your thresholds |
| **Max Duration** | Skip long mixes, focus on singles |
| **Liked Within** | Recent likes or dig into older crates |
| **Exclude Mixes / Podcasts / Live** | Cut noise from results |
| **Hide Seen** | Skip tracks you already previewed |
| **Clips filter** | Hide, show, or browse previews/snippets only |
| **Search** | Title, artist, label, genre, tags |
| **Sort** | Any table column |

### Gems & sessions
| Feature | Description |
|---------|-------------|
| **My Gems** | Star tracks permanently (local storage) |
| **Session gems** | Temporary stars for one dig session |
| **Export** | JSON or copy URLs for My Gems & Session |
| **Tabs** | All Tracks · My Gems · Session |

### Playback
| Feature | Description |
|---------|-------------|
| **Now Playing** | Title & artist in side panel |
| **Play / Pause / Previous** | Controls playback on SoundCloud tab |
| **Next Gem** | FAB button — jump to next filtered track |
| **Dig Session** | Auto-advance after 30–90s or 50–75% of track |
| **Seen tracking** | Marks tracks when dig session advances |

### Browse
| Feature | Description |
|---------|-------------|
| **Top Tags / Artists / Labels** | Quick filters from your library |
| **All Artists / Labels** | Searchable full lists with min-count filter |
| **Artist filter** | Works with presets — filters by parsed artist (premiere channels) |
| **Label filter** | Browse one label within current preset |
| **Find full** | For preview clips — search full versions by artist |

### Premiere channels
Uploader channels (Novaj, Mixmag, Boiler Room, etc.) are detected automatically. Artist is parsed from track title instead of channel name.

### Stats
Compact **Matching / Unseen** counters. Expand **More stats** for totals, clips, gems, averages.

## Privacy

All data stays on your device. No analytics, no external servers.

- [Privacy Policy](docs/privacy.html) (also host on GitHub Pages for Chrome Web Store)

## Chrome Web Store checklist

- [ ] Replace `YOUR_USERNAME` in `docs/privacy.html`, `docs/index.html`, and `sidepanel.js` (`PRIVACY_POLICY_URL`)
- [ ] GitHub Pages: Settings → Pages → `/docs` folder
- [ ] Privacy URL: `https://YOUR_USERNAME.github.io/Soundcloud_Hidden_Gems/privacy.html`
- [ ] 3–5 screenshots of the side panel
- [ ] Zip `chrome-extension/` for upload (or publish via Chrome Web Store dashboard)

## Permissions

| Permission | Why |
|------------|-----|
| `sidePanel` | Extension UI |
| `storage` | Cache likes locally |
| `tabs` / `activeTab` | Load likes & control playback on SoundCloud tab |
| `soundcloud.com` | Read likes via your existing login session |

## Project structure

```
chrome-extension/   ← load this in Chrome
docs/               ← privacy policy + GitHub Pages
LICENSE
```

## Development

Regenerate icons after changing the source image:

```powershell
powershell -ExecutionPolicy Bypass -File chrome-extension/scripts/make-icons.ps1
```

## License

MIT — see [LICENSE](LICENSE).
