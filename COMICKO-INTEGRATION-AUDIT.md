# COMICKO Integration Audit

## Verified source build status

GitHub Actions run [40819513483](https://github.com/akiraa14200/comic/actions/runs/40819513483) completed successfully:
- `build-music-baseline`: success
- `build-manga-baseline`: success
- `integration-audit`: success

These validate each source project independently. They do not prove a combined APK.

## Source architecture discovered

### Music player (Velune)
- Application namespace: `com.nikhil.yt`
- Launcher activity: `com.nikhil.yt.MainActivity`
- Real playback service: `com.nikhil.yt.playback.MusicService`
- Media stack: AndroidX Media3 `MediaLibraryService` / `MediaSession`
- Dependency modules: `:innertube`, `:kugou`, `:lrclib`, `:lastfm`, `:betterlyrics`, `:kizzy`, `:simpmusic`, `:canvas`
- Application setup: Hilt, Coil singleton image loader, app-specific preference and logging initialization.
- Build baseline: AGP 9.1.1, Kotlin 2.3.10, Gradle 9.3.1.

### Manga reader (Yōkai)
- Application namespace: `eu.kanade.tachiyomi`
- Main activity: `eu.kanade.tachiyomi.ui.main.MainActivity`
- Reader activity: `eu.kanade.tachiyomi.ui.reader.ReaderActivity`
- Main application startup class: `eu.kanade.tachiyomi.App`
- Architecture includes Koin/injekt and custom Gradle convention plugins in `buildSrc`.
- Build baseline: AGP 8.12.2, Gradle 8.14.4, separate AndroidX/Compose/Kotlin version catalogs.

## Integration blockers that need deliberate handling

1. **Build toolchain:** the projects have different AGP, Kotlin, Gradle, and catalog setups. Both independently build, but their configurations cannot simply be pasted together.
2. **Application classes:** each app declares its own `Application` subclass. Velune's class is `@HiltAndroidApp`; Yōkai's initializes reader services and dependency injection. One Android package can have only one active `Application` class, so startup responsibilities must be combined explicitly.
3. **Manifest merge:** both declare launcher activities, application attributes, resources, providers, and services. Velune's `MusicService` and download service must be retained; Yōkai's reader and extension components must also remain.
4. **Music UI and playback:** the playback service/session must remain the single source of truth. The floating controller must connect to Media3 session state and issue real play/pause/seek commands; it must not simulate playback.
5. **Branding and UX:** a COMICKO navigation shell and glassmorphism theme need to be added without replacing the existing reader or music functionality.
6. **Validation:** the final workflow must build one installable COMICKO APK and publish it separately from the two baseline artifacts. Runtime verification of reading while music continues is still required.

## Safe integration order

1. Keep the currently passing independent baseline jobs as regression checks.
2. Create an isolated integration experiment so a failed merge cannot break the working source archives.
3. Reconcile catalogs and plugin versions; convert the secondary app module into a library only after its application-only configuration has been removed.
4. Merge the manifest and combine startup responsibilities.
5. Add COMICKO navigation and connect the reader/music surfaces to the existing implementations.
6. Build one combined APK in CI, inspect its merged manifest, then test installation and music playback while opening a chapter.

## Current completion status

**Not integrated yet.** No combined APK is being presented as finished. The current artifacts are independent music and manga baseline APKs only.
