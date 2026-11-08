# Fire Fighters — Design Direction (v2, light)

The goal is a tool a city fire-operations team would trust, and that a judge reads in five seconds. It should be calm, light, dense where it matters and empty everywhere else. These rules are binding. Check every PR against them.

## 1. Concept
- **The map is the product.** The console has no sidebar or full-width header. Chrome floats in small clusters at the edges: brand and search top-left, status and actions top-right, navigation in a bottom dock. Nothing covers the centre of the map.
- **Calm until it isn't.** Neutral greys carry about 90% of the UI. Color is spent on hydrant status and on the single primary action in view. Red is the loudest thing on screen *because nothing else is loud*.
- **Linked views.** Selecting on the map drives the panel, charts and 3D twin. Filters drive the map. There are no isolated widgets.
- **Progressive disclosure.** Filters stay collapsed until asked for. The hydrant panel splits into tabs (Overview, Telemetry, History) instead of one long scroll.

## 2. Color
Tokens live as CSS variables in `src/styles/tokens.css`. Never hardcode color values in components.

Grey roles follow the Geist scale: canvas → surface → hover → active, hairline border → strong border, secondary text → primary text.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#fafaf9` | app canvas, warm off-white (never pure white) |
| `--surface-1` | `#ffffff` | panels, cards, floating chrome |
| `--surface-2` | `#f5f5f4` | hover, subtle fill |
| `--surface-3` | `#ececE9` | active/pressed, switch tracks |
| `--line` | `#e5e5e2` | hairline borders, dividers |
| `--line-strong` | `#d3d3ce` | input borders, hover borders |
| `--text-1` | `#171717` | primary text **and primary buttons** |
| `--text-2` | `#525252` | secondary |
| `--text-3` | `#737373` | tertiary, still ≥ 4.5:1 on white |
| `--accent` | `#0066cc` | focus rings, selection, links only |
| `--ok` | `#15803d` | Accessible |
| `--warn` | `#b45309` | Possible obstruction |
| `--crit` | `#c81e1e` | Blocked |
| `--muted` | `#787880` | Offline / unmonitored |

- Primary buttons are near-black (`--text-1`), not blue. Blue means "focused or selected", never "click me".
- Status hues are the darker 700-level shades so they hold contrast on white.
- Elevation: flat surfaces use a 1px hairline. Floating surfaces (`.float`) use a semi-transparent border plus **two layered shadows** (ambient + direct). Nothing else gets a shadow.
- **No gradients** on text, buttons or backgrounds. No glow. No purple.
- Backdrop blur appears only on chrome floating over the live map.

## 3. Status is never color-only (WCAG 1.4.1)
| State | Marker | Icon | Label |
|---|---|---|---|
| Accessible | filled dot | `CircleCheck` | Accessible |
| Potential obstruction | dot with outer ring | `TriangleAlert` | Possible obstruction |
| Blocked | larger dot, slow pulse (off under reduced motion) | `OctagonX` | Blocked |
| Offline | hollow dot | `WifiOff` | Offline / Unmonitored |

Check with Chrome DevTools › Rendering › Emulate vision deficiencies before demo day.

## 4. Typography
- **UI:** Geist 400/500/600. **Data** (IDs, coordinates, readings, timestamps, signatures): Geist Mono with `tabular-nums`.
- Console scale (px): 11 / 12 / 13 / 14 / 16 / 20 / 24. Body text is 13. There are no hero-sized headings in the console.
- **Landing page exception:** one H1 at 40–48px, tracking −0.025em, `text-wrap: balance`. Nothing else on the landing page exceeds 20px.
- Sentence case everywhere (GOV.UK convention for civic services). No eyebrow text, and no tracked all-caps outside tiny legends.

## 5. Space, shape, density
- Use a 4px grid: 4 / 8 / 12 / 16 / 24 / 32.
- Radius: 6px for controls, 8px for panels, 12px for the dock and landing media. Nested radii are concentric: a child never has a larger radius than its parent.
- Hit targets are ≥ 24px on desktop and ≥ 44px for dock items and on touch.
- Use no icon-card grids. Tabular data goes in tables and lists with dividers. A container never sits inside another container.
- KPIs sit in one divided strip.

## 6. Navigation and components
- **Bottom dock:** five destinations (Map, Incidents, Analytics, Tasks, Settings), icon plus label, with the active item on `--surface-3`. When the hydrant panel is open, the dock re-centres in the remaining space.
- **One primary button per view.** Labels are verb + object ("Subscribe to alerts", "Claim task", "Approve clearance").
- Icon-only buttons always have `aria-label` and a tooltip.
- Keyboard: `/` focuses search and `Esc` closes the hydrant panel.
- Empty states say what's missing and give the next action. Error messages say what happened, why, and what to do.

## 7. Map
- Basemap: CARTO Positron (light, muted). Satellite and 3D buildings are opt-in layers.
- Clusters are white discs with a count and a hairline. They take a 2px status-colored ring only when they contain warnings or blocks.
- The selected hydrant gets an accent ring. On first load the map frames the dataset.
- The hover card shows four fields: ID, status, last update, sensor health.
- Attribution stays visible.

## 8. Charts
- Area chart for distance, line chart for temperature, bars for categories. No pie charts.
- Horizontal gridlines only. Axis text is 11px `--text-3` with no axis lines.
- Threshold lines are dashed and labelled inline, on opposite sides so they never collide. Obstruction periods show as `--crit` bands at 8%.
- A fresh state change auto-selects the 1H range so it is visible at a glance.

## 9. Motion
- One easing curve, `cubic-bezier(0.2, 0, 0, 1)`, at 150–250 ms. Animate only `transform` and `opacity`.
- **One orchestrated moment:** CLEAR → BLOCKED. The marker flips red, the toast arrives, the badge ticks, the panel header flashes once, and the twin plays its shockwave.
- The landing hero loops (12 s), so it has a visible **pause control** (loops > 5 s must be pausable). Reduced motion shows a static frame.
- `prefers-reduced-motion` disables pulses, auto-rotation and scanner sweeps, and replaces slides with fades.

## 10. Honesty in copy
- The dock always shows "Simulated data", and its tooltip explains the data sources.
- Mock deliveries are labelled "Simulated — not sent", and the twin "Illustrative model".
- The landing page's technology table marks each component "In this demo" or "Planned".

## 11. Pre-merge checklist
- [ ] No raw color values outside `tokens.css` (generated sample images excepted).
- [ ] Every status shows color, shape or icon, and a label.
- [ ] Numbers use mono and tabular figures, right-aligned in tables.
- [ ] One primary button per view, with verb + object labels.
- [ ] No nested containers or icon-card grids. Radii are concentric.
- [ ] Hit targets ≥ 24px (44px on touch). Icon buttons are labelled.
- [ ] Empty, loading and error states each offer a next action.
- [ ] Reduced motion and a deuteranopia simulation have been checked.

## Sources
- Vercel, [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines): layered shadows, concentric radii, hit targets, tabular numbers, pausable loops, reduced motion
- Vercel, [Geist colors](https://vercel.com/geist/colors): grey-scale role mapping
- [Dashboard color schemes guide](https://designrockdh.com/dashboard-color-schemes/) and [AdminLTE color guide](https://adminlte.io/blog/best-admin-dashboard-color-schemes/): neutral-heavy palettes, semantic color reserved for meaning
- [UXPin, mobile navigation](https://www.uxpin.com/studio/blog/mobile-navigation-examples/) and [Uxcel, navigation](https://uxcel.com/lessons/navigation-678): 3–5 bottom destinations, content-first minimal chrome
- [9to5Google on Material 3 floating toolbars](https://9to5google.com/2025/05/18/material-3-expressive-toolbars/): floating contextual controls over content
- v1 research (anti-AI-slop checklists, WCAG 1.4.1, NHS status palette, Esri dashboard maps) still applies. See git history.
