# RykocCllection — Anime Discovery

A responsive anime discovery interface inspired by modern streaming catalogues. This is a fresh web application replacing the previous repository contents.

## Features

- Discover trending, popular and current-season anime.
- Search AniList's public catalogue and filter by genre.
- Anime detail pages with synopsis, genres, studio and metadata.
- Browser-local watchlist and recently viewed history.
- Responsive layouts for mobile and desktop.
- Privacy information page; no advertising SDKs or analytics scripts are bundled.
- Optional user-supplied external video URL handoff. The app does not host episodes or provide unauthorized streams.

## Stack

- React + TypeScript
- Vite
- React Router
- AniList public GraphQL API
- Local storage for personal watchlist/history

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run typecheck
npm run build
npm run preview
```

## Data and privacy

Anime metadata is requested directly from AniList's public GraphQL API. Watchlist and recently viewed metadata are stored in the current browser's local storage; there is no account backend or cross-device sync in this version.


## Scope notes

Authentication, cloud sync, server-side admin management, episode hosting and a provider-integrated player require trusted backend services and authorized content sources. They are intentionally not represented as implemented features in this frontend-first release.

## Credits

Anime metadata: [AniList](https://anilist.co/). RykocCllection is an independent project and is not affiliated with AniList or the reference website.

## Android APK

RykocCllection is packaged for Android with Capacitor. Every push to `main` that changes the app source or Android packaging configuration starts the **Build Android APK** workflow. You can also start it manually from the repository's Actions tab.

When the workflow succeeds:

1. Open the repository's **Actions** tab.
2. Select the latest **Build Android APK** run.
3. Under **Artifacts**, download `RykocCllection-Android-debug-APK`.
4. Extract the ZIP and install `app-debug.apk` on your Android device.

This is a debug APK for testing and personal installation, not a Play Store-signed release. The APK artifact is retained by GitHub Actions for 14 days. Android project files are generated during CI, so the repository remains focused on the web source and build configuration.


## Video previews

The Video tab displays trailer metadata from AniList and embeds supported YouTube previews. It does not host episodes, extract streams, or proxy third-party video files. Playback and availability are controlled by YouTube and the video publisher.
