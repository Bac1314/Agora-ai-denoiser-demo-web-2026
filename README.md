# Agora AI Noise Suppression — Web demo

A static page for trying the Agora Web AI denoiser extension (`agora-extension-ai-denoiser@2.0.2`) with Agora Web SDK 4.24.9.

- Turn the denoiser on and off, and change Mode (`NSNG` / `STATIONARY_NS`), Level (`SOFT` / `AGGRESSIVE`) and Latency (`FULL` / `LOW`) during a call
- Local and remote views side by side, with volume meters and optional camera
- "Hear myself": play back your own mic after processing (use headphones)
- Falls back to `STATIONARY_NS` automatically when the CPU is overloaded
- Audio dump button to collect files for Agora support

No build step. The SDK, the extension and its Wasm files all load from jsDelivr, which sends CORS headers, so there is nothing to host yourself.

## Deploy to GitHub Pages

1. Create a repo and add `index.html`, `app.js` and `style.css` at the root.
2. Go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then `main` / `(root)`.
3. Open `https://<user>.github.io/<repo>/`.

## Run locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. The mic only works over HTTPS or on `localhost`.

## Usage

1. Enter an App ID and a channel. Add a token if the project has an App Certificate. **Copy invite link** shares the App ID and channel, but not the token.
2. Open the link on a second device. **Both sides wear headphones.**
3. Talk on device A while making noise, and change the settings. Listen on device B.

## Pinned versions

To upgrade, change the version numbers in `index.html` (both `<script>` tags) and `EXT_VERSION` in `app.js`.
