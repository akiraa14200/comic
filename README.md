# Kairo — Anime Discovery

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

A normal website cannot reliably block ads or trackers inside cross-origin third-party video players. The privacy page describes this limitation accurately. For network-level filtering, users can configure a reputable browser content blocker or device-level DNS filtering. This app does not bypass DRM, authentication, subscriptions, paywalls or provider access controls.

## Scope notes

Authentication, cloud sync, server-side admin management, episode hosting and a provider-integrated player require trusted backend services and authorized content sources. They are intentionally not represented as implemented features in this frontend-first release.

## Credits

Anime metadata: [AniList](https://anilist.co/). Kairo is an independent project and is not affiliated with AniList or the reference website.
