# dsh-effort-mascot

**English** | [中文](README.md)

Turn the composer's **reasoning-effort** control in **DeepSeek Harness** from a dropdown into a **slider card with a face**. Same job as before — pick off / low / high / max — just made a bit more fun.

**One fish, four moods**: dozing when Off, snacking on rice at Low, starry-eyed at High, and spinning-eyed overload at Ultra. The card follows the level — grey → blue → purple → a gold ring — and the slider fills with the matching gradient. Landing on Ultra opens with a one-off line ("maximum reasoning effort may use more tokens") that fades out after three seconds.

> **One mapping worth stating**: the **Ultra** label is DeepSeek's `max` level. It only gets a friendlier name and a visual identity; the request still carries `reasoningEffort: "max"`. The other three keep the adapter's own names (Off / Low / High).

Nothing underneath changed: it reuses the official model directory and `session.selectModel` — the same control, drawn differently.

> **The card is always dark and deliberately does not follow the light/dark theme.** It reads as a dark material floating above the composer, which keeps the illustrations and the gold highlights working in both themes.


![Four tiers](docs/four-tiers.webp)

Dragging through the levels, landing on Ultra (which opens with a one-off notice):

![Demo](docs/slider-demo.gif)

> The GIF is capped at 15fps so it can autoplay inline. Full speed and audio: [download the video](docs/slider-demo.mp4).

## Install

Clone the repo somewhere permanent, then link it into your profile:

```sh
git clone https://github.com/<your-name>/dsh-effort-mascot.git
dsh plugin --profile web add ./dsh-effort-mascot
```

Restart `dsh web` afterwards (the Host half registers the illustration route at boot). The composer control is replaced on the next page load.

## Compatibility

| | |
|---|---|
| Tested with | DSH `0.2.1-rc.2` |
| Mechanism | shadows the shipped `conversation.input.model` slot at `priority: -1` |
| Failure mode | if that seat's contract changes, this plugin silently does not register — the official control stays, nothing breaks |
| Blast radius | none on the Host, the session log, or what the model sees: selection still goes through `session.selectModel` |

## Tiers

| Level | Colour | Illustration |
|---|---|---|
| Off | neutral grey | dozing |
| Low | blue | snacking |
| High | purple | idea |
| **Ultra** (= DeepSeek's `max`) | gold + badge | overloaded |

The top level adds colour-only motion (rotating conic ring, card brightness breathing, slider sheen, bolt glow), plus a one-off splash line when you land on it. Everything respects `prefers-reduced-motion`.

## Custom illustrations

Files live at `assets/<effort-id>.webp` — 360×360 transparent canvas, subject height normalised so the four characters read at the same size. The Host half serves them from `GET /model-effort/asset/<name>` (a Client bundle cannot import an image).

- Replace a file with the same name → reload the page (the asset cache invalidates on mtime + size).
- Add art for another level → drop the file and add one line to `TIER_IMAGES` in `client.js`.

The bundled art is AI-generated sample material, replace it with whatever you like.

## Remove

```sh
plugin_manager remove_bundle target=dsh-effort-mascot
```

The shipped control comes back immediately; nothing is left behind.

## Known limitations

- The trigger does not use the shipped `conversation.input.model.label` slot, so the `1017` badge contributed by `ui-deepseek-model-label-1017` is not shown on this button.
- The in-card model list has no search (fine for a couple of models; use `/model` for the full picker).
- Diagnostics: render failures are written to `~/.dsh/model-effort.log`.

## License

Code: MIT. Illustrations: AI-generated samples, not claimed as original works.
