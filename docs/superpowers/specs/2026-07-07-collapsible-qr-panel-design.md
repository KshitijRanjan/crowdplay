# Collapsible QR/PIN Panel + Empty-State Cleanup — Design Spec

**Date:** 2026-07-07
**Status:** Approved

## Problem

After hiding the room code (see `2026-07-07-qr-join-design.md`), the host view's header panel (Guest PIN + QR) and the "Waiting for songs..." empty state together read as visually heavy: the PIN is shown twice (once in the header card, once in "Tell guests: PIN ..."), and the empty state has a large icon + heading + subtext for very little information. The host also wants to be able to collapse the QR/PIN panel once they're done sharing it, so it stops taking up space and drawing attention while the party is running.

## Scope

**In scope:**
- Make the header's Guest PIN/QR panel (`src/App.jsx:1760-1782`) collapsible, defaulting to expanded.
- Move the QR into the same row as the PIN (inline) rather than stacked below in its own bordered sub-section.
- Simplify the empty state (`src/App.jsx:1902-1911`, shown when `!currentSong`): drop the icon circle, shrink the heading, remove the duplicate PIN line.

**Out of scope:**
- No persistence of collapsed/expanded state across page reloads or between parties — always starts expanded.
- No changes to the PIN/QR values themselves, Firestore, or the join flow (already covered by the earlier QR-join spec).
- No changes to the "Now Playing" state (`currentSong` present) — only the `!currentSong` empty state changes.

## Design

### Collapsible panel

New local state in `HostView`: `const [panelExpanded, setPanelExpanded] = useState(true);`

**Expanded** (default): existing card, restructured to one row instead of two stacked sections:
- QR code (`QRCodeSVG`, 128px, white background box, unchanged from current implementation) on the left.
- Guest PIN label + value in the middle, with the existing copy button.
- A chevron-up toggle button on the right that sets `panelExpanded` to `false`.

On narrow viewports the row wraps (QR above PIN) via flexbox `flex-wrap` — no separate mobile layout needed.

**Collapsed**: the same card, replaced with a single slim row:
- A small status dot (purely decorative, signals "party live") + text: `Guests can join with PIN {guestPin}` (PIN in the existing pink/mono styling).
- A chevron-down toggle button on the right that sets `panelExpanded` to `true`.

No QR image is rendered in the collapsed state (not just visually hidden — unmounted, so there's no layout cost).

### Empty-state simplification

Current (`src/App.jsx:1902-1911`):
```jsx
<div className="text-center">
  <div className="w-32 h-32 bg-slate-800/80 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
    <Music className="w-16 h-16 text-slate-600" />
  </div>
  <h2 className="text-3xl font-bold text-white mb-4">Waiting for songs...</h2>
  <p className="text-slate-400 text-lg">
    Tell guests: PIN <span className="font-mono text-pink-400">{guestPin}</span>
  </p>
</div>
```

New: drop the icon `div`, shrink the heading (`text-3xl` → `text-xl`), replace the PIN-repeating paragraph with a plain hint that doesn't repeat information already visible in the header panel:
```jsx
<div className="text-center">
  <h2 className="text-xl font-bold text-white mb-2">Waiting for songs...</h2>
  <p className="text-slate-400 text-sm">Search above to add the first one</p>
</div>
```

## Data Flow

Purely local UI state — `panelExpanded` lives in `HostView`, toggled by the chevron button's `onClick`. No Firestore reads/writes, no new props, no interaction with `roomCode`/`guestPin` beyond what's already passed into `HostView`.

## Error Handling

None needed — this is presentational state with no failure modes (unlike network/Firestore calls elsewhere in `HostView`).

## Testing

Manual verification (no test framework in this project, per existing convention):
1. Start a party as host. Confirm the panel starts expanded: QR (128px) + PIN + copy button in one row, chevron pointing up.
2. Click the chevron. Confirm it collapses to the single-line "Guests can join with PIN ..." row, chevron now pointing down, QR no longer in the DOM.
3. Click the chevron again. Confirm it re-expands correctly, QR renders again and still encodes the correct join URL.
4. With no song playing, confirm the empty state shows a smaller heading and "Search above to add the first one" — no icon, no duplicated PIN text.
5. Resize the viewport to mobile width. Confirm the expanded panel wraps sensibly (QR above PIN) rather than overflowing or clipping.
6. Confirm the copy-PIN button (only present in the expanded state) still works — click it, confirm the checkmark feedback and that the PIN is actually on the clipboard.
