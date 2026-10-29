# COMICKO

COMICKO is intended to combine the supplied Velune music player and Yōkai manga reader into one Android application.

## Integration status

This repository is the target repository requested for COMICKO. The actual source trees must be committed under `music/` and `manga/` before the Android CI workflow can compile them. The integration workspace ZIP is not itself a finished merged app, and no APK should be described as complete until CI succeeds.

## Planned integration requirements

- One Android app and one APK, branded COMICKO.
- Preserve the original reader and music-player capabilities and their license notices.
- Music playback continues while reading manga.
- An in-app floating music controller wired to the real playback service/session.
- Unified glassmorphism UI.
- GitHub Actions debug APK build and artifact upload.
