# Sedifex Admin AI Video Studio (prototype)

Path: `/admin/ai-studio`, available to platform `super_admin` and `ops_admin` only. This is an experiment; it is not a customer product or a paid video-generation system.

## Workflow

1. Enter a business name, product/service, optional price and CTA.
2. Upload a product image and optionally a logo (up to 8 MB, JPEG, PNG or WebP).
3. Choose Bold, Luxury or Fresh, aspect ratio (9:16, 1:1 or 16:9), and 12/15/20-second length.
4. Generate the four-scene storyboard or edit each scene manually.
5. Preview the animated video and click **Create video**. Recording runs locally in the browser in real time.
6. Preview and download the generated video. The caption has a separate copy control.

The video export uses browser Canvas and MediaRecorder. It is not a static image: animated backgrounds, photo zoom, scene changes, progress bar, brand graphics and moving titles are rendered during the recording. Optional audio is a locally synthesized simple tune generated with Web Audio. No third-party music is downloaded or used.

## File formats and compatibility

The exporter attempts native MP4 if the browser's MediaRecorder advertises support. Otherwise it exports WebM. MP4 is **not** guaranteed in every browser, notably some Firefox configurations; do not label WebM output as MP4. If guaranteed MP4 is required for public release, add a tested MP4 transcoding path (client-side codec/muxer or server-side FFmpeg) and verify size, rendering time and browsers first.

Export speed is approximately the video length because MediaRecorder records live canvas playback. Browser API limits, unsupported codecs, memory limits and hidden tabs can affect recording. No audio narration, automatic social posting, asset persistence or customer billing is included.

## Optional Google Gemini scripts

**Zero-Google-charge default:** When the key or feature flag is missing, the secured script API returns a deterministic local storyboard without contacting Google.

For optional AI scripting, set server-side environment variables:

```text
GEMINI_API_KEY=(server-side secret)
SEDIFEX_AI_STUDIO_ENABLE_GEMINI=true
```

The server uses `gemini-2.5-flash-lite` `generateContent`. Google usage can be free **only if the Google account, model, region and quotas qualify for its free tier**. An API key does not guarantee free billing. Confirm Google API billing, quota and consent before enabling. Do not expose the key through `NEXT_PUBLIC_` or accept it from browser input.

The route `/api/admin/ai-studio/script` verifies an authenticated platform admin with the `super_admin` or `ops_admin` role, sanitizes input and AI output, and uses a local template when Gemini times out or fails.

## Release gates

- Review UI in Chrome, Firefox and Safari.
- Verify MP4 or WebM content and audio playback and actual extension in each browser.
- Confirm the page is inaccessible to staff/store users; confirm script API returns 403 for unauthorized calls.
- Confirm free fallback works with no `GEMINI_API_KEY`.
- Review Vercel preview/CI before merging to production.
- Review customer entitlements, usage caps, moderation, and payment/billing separately before making Video Studio publicly available.
