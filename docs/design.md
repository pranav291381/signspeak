# Design

SignSpeak's look comes from its logo: **saffron** (`#F4B63F`), **deep ink** (`#1F232C`) and a warm paper background. The tokens live in `mobile/src/theme/tokens.ts`, and `src/theme/__tests__/contrast.test.ts` checks every colour pair the app uses against WCAG AA.

## Principles

- **One brand colour, used for what matters.** Saffron fills mark the app's main action (the Sign → Text card on Home, the camera's pause button, the Play button in Text → ISL) and where you are (the selected tab). Text on saffron is always ink.
- **Ink for actions in the light theme, saffron in the dark theme.** `primary` is ink on paper and saffron on near-black. Both pass 4.5:1 for text.
- **Soft surfaces.** White cards with a hairline edge and a soft warm shadow on the paper background; in the dark theme borders separate surfaces instead of shadows. Corners are generous (10 / 14 / 22 / 28 px) and buttons are pills.
- **Motion that follows your finger.** Everything tappable eases down while held and springs back (`PressableScale`). The tab bar's saffron pill and the segmented controls slide to the new choice, screens fade and rise in, and results pop in. With the system's "reduce motion" setting nothing moves; only opacity changes.
- **Colour is never the only cue.** Status has an icon and text; selection has a check mark, an outline or a filled shape; icon tiles in Settings sit next to text labels.

## Pieces

| Piece | Where |
| --- | --- |
| Floating tab bar: ink pill, saffron indicator that springs between tabs, selection haptic (when haptics are on); steps aside for the keyboard on Android | `src/navigation/FloatingTabBar.tsx` |
| Saffron glow at the top of tab screens | `src/components/Glow.tsx` (used by `Screen`) |
| Home: brand header, greeting, Sign → Text hero card, Text → ISL and History tiles, recent activity (when history is on) | `src/features/home/HomeScreen.tsx` |
| Settings-style rows with coloured icon tiles; `Section variant="list"` separates rows with hairlines | `IconTile`, `ListRow`, `SwitchRow`, `Section` |
| Live status dot that breathes while the camera is watching | `src/components/LiveDot.tsx` |

## Going back to the previous design

The design before this revamp (indigo, standard tab bar) is kept on the branch **`ui-classic`** (commit `246a93c`, the last commit before the revamp). To look at it, check that branch out and run the app as usual:

```bash
git fetch origin ui-classic
git checkout ui-classic
cd mobile && npm install && npm start
```

To return to it for good, revert the revamp's merge commit on `main` (`git revert -m 1 <merge commit>`), which keeps the history of both designs.
