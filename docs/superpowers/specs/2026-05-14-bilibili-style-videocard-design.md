# Bilibili-Style VideoCard Redesign

Date: 2026-05-14
Scope: `components/video/VideoCard.tsx` and the home-page grid container in `App.tsx`.

## Goal

Restructure the FluxFilter video card and home grid to mirror Bilibili's card visual language while preserving FluxFilter's dark theme, platform-color gradient strip, and the existing 32px UP-master avatar. Information density and overlay placement should match Bilibili's PC + mobile cards; the dark + cyber-lime brand tokens stay unchanged globally.

## Out of Scope

- Top navigation, sidebar, search bar, filter chips (All / 时间 / 日期 / 关注 / AI).
- Theme tokens in `index.html` (`cyber-lime`, `cyber-dark`, etc.) remain as defined.
- HotCarousel, PlatformTabs, drawer (bottom sheet), delete-confirm modal, embedded player — only the card chrome itself.
- Any other page that consumes `VideoCard`. Because the card is shared, all pages get the new look — but no per-page customization is added.

## Decisions Locked During Brainstorming

| # | Question | Decision |
|---|---|---|
| 1 | Fidelity | Dark Bilibili clone (keep dark theme, copy structure) |
| 2 | Avatar | Keep current 32px circular avatar (deviation from real Bilibili) |
| 3 | Text-strip background | Keep the pink/red platform gradient strip (deviation from real Bilibili) |
| 4 | UP master name color | Change from `text-cyber-lime` to gray (`text-gray-400`), hover white |
| 5 | Card shell | 8px radius, no border, no shadow (true Bilibili shell) |
| 6 | Scope | VideoCard + home grid spacing only |
| 7 | Title hover color | NOT Bilibili blue (`#00aeec`) — keep white |
| 8 | "UP" badge before name | Not added |
| 9 | Grid column counts | Unchanged — only spacing tightens |
| 10 | Theme tokens | Untouched — `cyber-lime` still used elsewhere |

## Acknowledged Hybrid

Real Bilibili cards have no gradient text strip — they are flat. By choosing to retain the pink/red strip, the final card is a hybrid: Bilibili skeleton + FluxFilter platform-color accent. This is intentional, but worth noting if a future maintainer wonders why this doesn't fully match the reference screenshots.

---

## §1 Card Shell

| Attribute | Current | New |
|---|---|---|
| Corner radius | `rounded-[1.25rem]` (20px) | `rounded-lg` (8px) |
| Border | `border border-white/[0.08]` + `hover:border-white/[0.12]` | Removed |
| Shadow | `shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30` | Removed |
| Outer hover | Border + shadow change + `active:scale-[0.98]` | `active:scale-[0.98]` retained for touch feedback; no outer scale/shadow on hover |
| Base background | `bg-[#0a0a0d]` | `bg-[#0d0d10]` (slightly lighter so the card is still discernible against `#050510` page bg) |

Rationale: the hover feedback now lives inside the thumbnail (`scale-105` on the `<img>` on PC only) and on the UP-master text (gray → white). The outer card chrome stays still so a grid of dozens of cards doesn't shimmer.

## §2 Thumbnail Overlays

| Attribute | Current | New |
|---|---|---|
| Bottom gradient mask | `from-black/90 via-black/20 to-transparent`, full height | `from-black/60 to-transparent`, applied only to bottom ~30% (height-limited) |
| Duration badge — position | Top-right `top-3 right-3` | **Bottom-right** `bottom-2 right-2` |
| Duration badge — style | `rounded-lg`, clock icon, `font-bold`, `bg-black/80` | `rounded-md`, no icon, `text-[11px] font-medium`, `bg-black/75` |
| Bottom-left (on thumbnail) | pubdate + clock icon | **Views + danmaku** (play-icon for views, message-icon for danmaku) |
| pubdate display | Bottom-left of thumbnail | **Moved to text section**, same row as UP master name |
| Watchlist star | `bottom-10 right-2` over a `bg-black/50` chip | **Top-left** `top-2 left-2` (avoids the bottom-right duration) |
| Charging / paywall badge | Top-left | Top-left (unchanged) |

Stats text styling on the thumbnail (white + `textShadow`) stays as-is; it is already cleaner than Bilibili's gray-pill approach.

Order conflict between watchlist star and the charging badge: when both appear, the charging badge keeps `top-2 left-2` and the star moves to `top-2 left-12` (≈48px offset) so they sit side by side.

## §3 Text Section

| Attribute | Current | New |
|---|---|---|
| Padding | `p-2.5` | `px-3 py-2.5` on PC, `p-2` on mobile (`md:px-3 md:py-2.5`) |
| Title size / weight | `text-[13.5px] font-semibold` | `text-[14px] font-medium` |
| Title line height | `leading-tight` | `leading-snug` |
| Title hover color | White (no change) | White (no change — explicitly NOT Bilibili blue) |
| UP master color | `text-cyber-lime` | `text-gray-400`; hover `text-white` |
| UP master weight / size | `text-[11.5px] font-semibold` | `text-[12px] font-normal` |
| UP master row | `[UP name]   [⋯]` | `[UP name] · [pubdate]   [⋯]` |
| pubdate styling | n/a (was on thumbnail) | `text-[12px] text-gray-500`, ` · ` separator before it |
| Three-dot menu visibility | Always visible | `md:opacity-0 md:group-hover:opacity-100` on PC; always visible on mobile |
| Gradient strip (text-section bg) | `bg-gradient-to-r from-pink-500/30 via-[#0d0d10] to-[#0d0d10]` (Bilibili) or `from-red-950/80 ...` (YouTube) | Unchanged |
| Avatar | 32px circular | Unchanged |

Truncation behavior on UP-master name remains `truncate`; the `·` separator and pubdate must live inside the same flex row so the truncation continues to apply to the UP name when names are long.

## §4 Home Grid Spacing

File: `App.tsx` around line 2025.

| Breakpoint | Current | New |
|---|---|---|
| `<sm` (mobile) | `grid-cols-2 gap-x-4 gap-y-6` | `grid-cols-2 gap-x-2 gap-y-4` |
| `md` | `md:grid-cols-3` | `md:grid-cols-3 md:gap-x-3 md:gap-y-5` |
| `lg` | `lg:grid-cols-3 lg:gap-x-4 lg:gap-y-8` | `lg:grid-cols-3 lg:gap-x-4 lg:gap-y-6` |
| `xl` | `xl:grid-cols-4` | `xl:grid-cols-4` (no spacing override beyond `lg`) |
| `2xl` | `2xl:grid-cols-4` | `2xl:grid-cols-4` (no spacing override beyond `lg`) |

Column counts unchanged. Vertical and horizontal spacing tightens one notch across the board to match Bilibili's denser feel.

Final class string:
```
grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4
gap-x-2 gap-y-4 md:gap-x-3 md:gap-y-5 lg:gap-x-4 lg:gap-y-6
```

## §5 Mobile-Specific Differences

| Attribute | Decision |
|---|---|
| Thumbnail hover zoom (`group-hover:scale-105`) | PC only — wrap in `md:group-hover:scale-105` so touch devices don't fire it on long-press / accidental hover |
| Three-dot menu | Always visible on mobile, hover-revealed on PC (see §3) |
| `active:scale-[0.98]` outer feedback | Retained on all viewports |
| Duration badge background | `bg-black/75` on both PC and mobile (no per-viewport override) |
| Text section padding | `p-2` mobile, `px-3 py-2.5` on `md+` |

## Testing / Verification

- [ ] Card renders correctly with all three data shapes: Bilibili `VideoWithUploader`, YouTube `VideoWithUploader`, legacy `Video`.
- [ ] Charging badge + watchlist star do not overlap when both are present.
- [ ] Long UP-master names truncate (`truncate` on the UP-master `<span>`); pubdate has `shrink-0` and always stays fully visible to the right of the truncated name. UP master wins the space; if names are extreme, pubdate remains and UP is `...`-truncated.
- [ ] Three-dot menu opacity transition is smooth on PC; menu is fully reachable on mobile (always visible).
- [ ] Grid spacing visibly tightens at every breakpoint (test 320px / 768px / 1280px / 1920px).
- [ ] Drawer (bottom sheet) opening still works after the menu-button visibility change.
- [ ] No regression in `VideoCardSkeleton` placeholder (currently `aspect-[16/10]` + `rounded-2xl` — must drop to `rounded-lg` to match new shell radius).
- [ ] Mobile long-press does not trigger thumbnail scale.

## Risks / Known Issues

1. **Skeleton mismatch** — `VideoCardSkeleton` currently uses `rounded-2xl`; must update to `rounded-lg` to match.
2. **Three-dot menu disclosure breaks discoverability** — Hiding it until hover on PC means desktop users may not realize it exists. Acceptable risk: this is the standard YouTube/Bilibili pattern; users learn it.
3. **Removing the outer border** — On `#050510` page background with `#0d0d10` card background, card edges become subtle. If readability suffers in real testing, bump card bg to `#101015` or add `border border-white/[0.04]` back. Decide visually during implementation, not now.
4. **`isInWatchlist` star repositioning** — Moving the star from `bottom-10 right-2` to `top-2 left-2` may collide with the charging badge when both are present. Mitigated by offsetting the star to `top-2 left-12` in that case (§2).
5. **Animation conflict** — Current `animate-card-fade` keyframe is scoped to the `<img>`; unchanged. The removed shell `transition-all` may cause a brief loss of the existing fade-in on first paint — verify visually.
