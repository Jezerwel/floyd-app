# Floyd UI Overhaul — Design Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create implementation plan from this design doc.

**Goal:** Full UI rearchitecture of the Floyd fish feeder app — custom design system, rebuilt component architecture, responsive layouts, improved information hierarchy, and NativeWind integration with an aquatic/organic aesthetic.

**Design Philosophy:** "Living Water" — the app should feel like peering into a thriving aquarium. Fluid, breathing, alive.

---

## Decisions from grill-me

| Decision | Choice |
|---|---|
| Overhaul scope | Full rearchitecture (design system, component architecture, state management) |
| Visual aesthetic | Aquatic / Organic — deep ocean blues & teals, fluid animations, organic shapes, calm & natural feel |
| Priority balance | Balanced — visual excellence, accessibility/responsiveness, and code quality all equal |
| Architecture approach | NativeWind v4 (Tailwind for RN) + Custom aquatic theme overlay |
| Pain points | Looks generic, lack of motion, inconsistent/polish, code maintainability, poor info hierarchy, responsive issues |

---

## 1. Design System — "Living Water"

### 1.1 Color Palette

| Token | Light | Dark | Role |
|---|---|---|---|
| `--primary` | `#0E7490` (cyan-700) | `#22D3EE` (cyan-400) | Primary actions, active states |
| `--primary-container` | `#CFFAFE` (cyan-50) | `#164E63` (cyan-900) | Selected items, chips |
| `--secondary` | `#0891B2` (cyan-600) | `#67E8F9` (cyan-300) | Secondary elements, icons |
| `--accent` | `#F59E0B` (amber-500) | `#FBBF24` (amber-400) | Warnings, highlights, alerts |
| `--success` | `#10B981` (emerald-500) | `#34D399` (emerald-400) | Good status, connected |
| `--error` | `#EF4444` (red-500) | `#F87171` (red-400) | Errors, disconnected, critical |
| `--surface` | `#F0F9FA` (warm aqua-tint) | `#0F172A` (slate-900) | Page background |
| `--surface-card` | `#FFFFFF` | `#1E293B` (slate-800) | Card backgrounds |
| `--surface-elevated` | `#F8FAFC` (slate-50) | `#334155` (slate-700) | Modals, sheets |
| `--text-primary` | `#0F172A` (slate-900) | `#F1F5F9` (slate-100) | Headings, body |
| `--text-secondary` | `#475569` (slate-600) | `#94A3B8` (slate-400) | Subtitles, captions |
| `--border` | `#CBD5E1` (slate-300) | `#334155` (slate-700) | Dividers, card borders |
| `--ripple` | `rgba(14,116,144,0.12)` | `rgba(34,211,238,0.15)` | Press feedback |

### 1.2 Typography

| Role | Font | Weight | Sizes |
|---|---|---|---|
| Display | Playfair Display (serif) | 700 | 32, 40 |
| Heading | DM Sans (geometric sans) | 500, 700 | 20, 24, 28 |
| Body | DM Sans | 400, 500 | 14, 16 |
| Mono | SpaceMono (existing) | 400 | 12, 14 |

### 1.3 Spacing Scale (4pt grid)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

### 1.4 Animation Tokens

| Token | Value | Use |
|---|---|---|
| `duration-instant` | 100ms | Press feedback |
| `duration-fast` | 200ms | Hover, toggle, switch |
| `duration-normal` | 300ms | Card entrance, modal |
| `duration-slow` | 500ms | Page transitions, reveals |
| `easing-spring` | `{ damping: 15, stiffness: 150 }` | Organic motion |
| `easing-fluid` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard transitions |
| `stagger` | 50ms | List item stagger delay |

### 1.5 Shadows / Elevation

| Level | Light | Dark | Use |
|---|---|---|---|
| `0` | none | none | Flat content |
| `1` | `0 1px 3px rgba(0,0,0,0.08)` | `0 1px 2px rgba(0,0,0,0.3)` | Cards |
| `2` | `0 4px 12px rgba(0,0,0,0.1)` | `0 4px 16px rgba(0,0,0,0.4)` | FAB, modals |
| `3` | `0 8px 24px rgba(0,0,0,0.12)` | `0 8px 32px rgba(0,0,0,0.5)` | Sheets, drawers |

### 1.6 Icon System

Continue `@expo/vector-icons` (MaterialIcons) + SF Symbols mapping. New aquatic additions: `water`, `waves`, `droplet`, `thermometer-water`, `fish`.

---

## 2. Information Architecture & Screen Layouts

### 2.1 Dashboard — Hero + Grid

- **Hero section** (top): Large animated food-level gauge as the primary visual. Connection status as a subtle pill badge above it.
- **Status strip** (below hero): 3 compact stat chips in a row — Water Temp, Motor State, WiFi — glanceable, no full cards.
- **Alerts area** (bottom): Collapsed by default if all-clear, auto-expands when an alert fires. Inline animated banner.

### 2.2 Controls — Command-Centric

- **Hero FEED button** (center): Large, animated circular button with a ripple/water effect. Primary action.
- **Live status indicator**: Subtle animated bar showing current motor state (idle/feeding/jammed).
- **Settings drawer** (bottom sheet): Auger/Impeller sliders, durations, pre/post-spin — collapsible panel. Not shown by default.
- **STOP / CLEAR JAM**: Contextual — STOP only during feeding, CLEAR JAM behind a secondary tap.

### 2.3 Logs — Timeline View

- **Filter chips** (top): Sensor Data | Alerts | Feed History — pill toggles with animated selection indicator.
- **Timeline cards**: Each log entry rendered as a timeline node with colored dot (green=sensor, amber=alert, blue=feed). Vertical line connecting entries.
- **Proper FlatList**: No nested ScrollView. Virtualized with `getItemLayout`.
- **Search/date filter**: Placeholder in design for later implementation.

### 2.4 Schedule — Calendar + Cards

- **Weekly overview strip** (top): Horizontal scrollable day picker showing next 7 days with feed count badges.
- **Day timeline**: Scheduled feeds on a vertical timeline — time on left, feed details on right.
- **FAB**: Ripple-animated, positioned bottom-right, opens create modal.
- **Improved time input**: Styled HH:MM input with native time picker where available.

### 2.5 Navigation

Keep 4-tab structure (Dashboard, Controls, Logs, Schedule). Tab bar: frosted glass with ocean gradient hint, animated transitions, active tab glow/ripple indicator.

### 2.6 Responsive Strategy

- **Phone (portrait)**: Single-column, optimized with new hierarchy
- **Phone (landscape)**: 2-column grid on Dashboard, horizontal sliders on Controls
- **Tablet**: Dashboard gets persistent alerts panel, Controls show sliders alongside FEED button, Logs get master-detail split

---

## 3. Component Architecture

### 3.1 Layer 1: Design Tokens (`theme/`)

```
theme/
├── colors.ts        # Light + dark color tokens (extends NativeWind)
├── typography.ts    # Font families, sizes, weights
├── spacing.ts       # 4pt scale mapping to Tailwind spacing
├── animation.ts     # Duration/easing/stagger tokens
├── shadows.ts       # Elevation tokens
└── index.ts         # Barrel export
```

### 3.2 Layer 2: Atomic Components (`components/ui/`)

| Component | Replaces | Pattern |
|---|---|---|
| `Text` | ThemedText | `text-primary dark:text-primary-dark` |
| `Surface` | ThemedView | `bg-surface dark:bg-surface-dark` |
| `Card` | StatCard base | `bg-card rounded-2xl shadow-card p-5` |
| `Button` | AnimatedButton | `bg-primary rounded-xl px-6 py-4` |
| `IconButton` | — | `w-11 h-11 rounded-full` |
| `Badge` | ConnectionBadge | `px-3 py-1 rounded-full` |
| `Divider` | inline borders | `h-px bg-border` |
| `Progress` | — | `h-2 rounded-full bg-primary-container` |

Each atom gets `className` prop forwarded, supports dark mode via NativeWind's `dark:` prefix, and includes Reanimated press feedback.

### 3.3 Layer 3: Molecules (`components/molecules/`)

| Component | Combines | Purpose |
|---|---|---|
| `StatChip` | Icon + Text + Badge | Compact status indicator (temp, WiFi, motor) |
| `AlertBanner` | Card + Badge + Text | Auto-expanding alert notification |
| `TimelineNode` | View + Dot + Text | Single log entry in timeline |
| `DayChip` | Button + Badge | Day selector with feed count |
| `Gauge` | Svg + Text | Circular food level (enhanced CircularProgress) |
| `SliderControl` | View + CustomSlider + Text | Labeled slider with value display |
| `EmptyState` | Surface + Icon + Text + Button | Placeholder for no-content states |
| `Skeleton` | Animated.View | Loading shimmer |

### 3.4 Layer 4: Organisms (`components/sections/`)

| Section | Extracted From | Contains |
|---|---|---|
| `DashboardHero` | `index.tsx ~150 lines` | Food gauge, connection pill, refresh |
| `StatusStrip` | `index.tsx ~80 lines` | Temp, Motor, WiFi chips |
| `AlertPanel` | `index.tsx ~60 lines` | Alert list or "all clear" state |
| `ControlPanel` | `controls.tsx ~200 lines` | Feed button, status, settings sheet |
| `SliderSheet` | `controls.tsx ~150 lines` | Bottom sheet with sliders |
| `LogTimeline` | `history.tsx ~250 lines` | Filter chips + FlatList timeline |
| `ScheduleTimeline` | `schedule.tsx ~300 lines` | Week strip + day cards |
| `ConnectionCard` | ESP8266Connection | Simplified cloud status |

### 3.5 Layer 5: Hooks & Services (`hooks/`, `services/`)

| Hook | Purpose |
|---|---|
| `useResponsive` | `useWindowDimensions` + breakpoint utilities |
| `useSchedule` | Schedule CRUD with optimistic updates |
| `useFeedHistory` | History fetching with pagination |
| `useMotorControl` | Slider values, feed command composition |
| `useConnection` | Simplified connection state facade |

| Service | Purpose |
|---|---|
| `services/api.ts` | Unified REST client (replaces inline fetch) |
| `services/websocket.ts` | Wraps `useWebSocket` hook |

### 3.6 Screens After Extraction

Each screen becomes ~150-200 lines — import organism sections, import hooks, minimal local state, render `ScreenLayout` > sections.

### 3.7 NativeWind Configuration

- `tailwind.config.js` extended with custom aquatic theme
- `darkMode: "class"` — respects system preference via `useColorScheme()`
- Custom `nativewind-env.d.ts` for type-safe `className`
- Safe area utilities via `className="pt-safe"` (NativeWind v4 built-in)

---

## 4. Implementation Phases (High-Level)

1. **Infrastructure**: Install NativeWind, configure Tailwind, set up `theme/` tokens
2. **Atomic Components**: Build `Text`, `Surface`, `Card`, `Button`, `Badge`, `Divider`, `Progress`, `IconButton`
3. **Hooks & Services**: Extract `useResponsive`, `useSchedule`, `useFeedHistory`, `useMotorControl`, unify REST client
4. **Molecules**: Build `StatChip`, `Gauge`, `SliderControl`, `TimelineNode`, `DayChip`, `EmptyState`, `Skeleton`, `AlertBanner`
5. **Organisms**: Extract `DashboardHero`, `StatusStrip`, `AlertPanel`, `ControlPanel`, `SliderSheet`, `LogTimeline`, `ScheduleTimeline`
6. **Screens**: Rewire screens to use new organisms, remove old inline code
7. **Animation & Polish**: Aquatic micro-interactions, page transitions, ripple effects, staggered reveals
8. **Responsive**: Breakpoint-based layouts, tablet support, landscape
9. **Accessibility**: aria-labels, focus management, reduced motion, screen reader support
10. **Cleanup**: Remove dead code, unused deps (`@prisma/client`, `@prisma/react-native` from frontend), old unused components

---

## 5. Dependencies to Add

| Package | Purpose |
|---|---|
| `nativewind` | Tailwind for React Native |
| `tailwindcss` | Peer dependency for NativeWind |
| `react-native-reanimated` | Already installed (3.16), use for animations |
| `react-native-gesture-handler` | Already installed (2.28) |
| `expo-font` | Already installed, add Playfair Display + DM Sans |

### Dependencies to Remove (frontend only)

- `@prisma/client` — unused in frontend
- `@prisma/react-native` — unused in frontend
- `react-native-webview` — unused

---

## 6. Accessibility Commitments

- Every interactive element gets `accessibilityRole` + `accessibilityLabel`
- Touch targets minimum 44x44pt
- `prefers-reduced-motion` respected for all animations
- Dynamic Type / font scaling support
- Focus management for modals and sheets
- Semantic heading hierarchy
- Screen reader announcements for status changes (connection state, feed completion, alerts)

---

## 7. Success Criteria

| Metric | Target |
|---|---|
| Screen file size | < 200 lines each (currently 500-700) |
| Component reuse | All interactive elements use atomic `ui/` primitives |
| Dark mode | Full coverage, every screen tested in both themes |
| Responsive | No horizontal scroll on any device/orientation |
| Accessibility | 100% of interactive elements have labels |
| Animation | All interactions have press feedback within 100ms |
| Bundle size | Remove unused deps, code split by route |
| No dead code | Zero unused files, unified API client |
