# COMICKO

COMICKO is being developed as one Android application combining the supplied Velune music player and Yōkai manga reader.

## Current status

- Source archives are committed at the repository root as `Velune-main.zip` and `yokai-master.zip`.
- GitHub Actions extracts each archive and runs independent baseline build checks.
- Latest baseline CI run passed: both independent APK builds completed successfully.
- The baseline jobs are validation only. They do not yet constitute the merged COMICKO app.

## Integration requirements

- One installable Android app/APK branded COMICKO.
- Preserve reader and music-player features and applicable license notices.
- Music playback must continue while the reader is open.
- Floating in-app music controls must connect to the actual playback service/session.
- Unified glassmorphism UI.
- GitHub Actions build and APK artifact publishing.

## Integration constraints found during source audit

The two source projects currently use different Android build configurations and dependency catalogs. Velune uses AGP 9.1.1/Kotlin 2.3.10, while Yōkai uses AGP 8.12.2/Kotlin 2.4.10 and custom Gradle convention plugins. They also each declare their own application module, manifest, resources, and launch activity. A real merge therefore requires deliberate Gradle/catalog reconciliation and manifest/resource integration; simply copying one app's source into the other would not produce a reliable single APK.

The source-level audit is documented in [COMICKO-INTEGRATION-AUDIT.md](./COMICKO-INTEGRATION-AUDIT.md). It confirms the real Media3 playback service, manga reader entry point, and the application/Gradle conflicts that must be resolved.

Do not treat the baseline APKs as the finished COMICKO app. The combined app is complete only after integration compiles and reader/music handoff is verified.
