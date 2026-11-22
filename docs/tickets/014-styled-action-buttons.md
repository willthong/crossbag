# Ticket 14 — Style the wizard's action buttons

**Depends on**: Ticket 4 (setup wizard), Ticket 7 (bulk Sync).

**Seam**: `renderForm` in `src/plugin.ts`, driven through
`tests/plugin.test.ts`. `addButton` gains a variant argument and an internal
`ensureButtonStyles` injects the stylesheet.

## Goal

The wizard's **Test Connection**, **Save** and **Sync** buttons render as bare
browser `<button>` elements next to the firmware's own coloured controls. Give
them distinct, legible colours — neutral for Test Connection, blue for Save,
green for Sync — without depending on the host page's stylesheet.

## Non-goals & limitations

- **Not the firmware's palette.** The plugin API (`registerPlugin(setup)`)
  hands the plugin a bare container and documents no component CSS or class
  names, so copying File Manager's exact look would mean hardcoding private
  class names or guessing at tokens. The colours are the plugin's own.
- **No restyling of the surrounding page.** Labels, inputs, status and alert
  elements keep whatever the firmware gives them; only the buttons and their
  row are touched, to avoid fighting host styles.

## Behaviour

- `.cbag-*` class names are namespaced so they cannot collide with host CSS.
- The stylesheet is one `<style data-cbag-styles>` element per container,
  injected once: re-rendering the form into the same container does not append
  a second copy.
- The three buttons sit in a `.cbag-actions` flex row that wraps on narrow
  screens.
- Each button carries `.cbag-btn` for shared shape plus one variant:
  `.cbag-btn-secondary` (Test Connection), `.cbag-btn-primary` (Save),
  `.cbag-btn-accent` (Sync).
- States: `:hover` and `:active` brighten/dim via `filter`, `:focus-visible`
  draws a visible outline, and `:disabled` fades the button and switches the
  cursor to `progress`, which is what Sync does while it runs.
- `prefers-color-scheme: dark` swaps in darker secondary and lighter primary
  and accent backgrounds.

## Acceptance criteria

- [ ] Test Connection, Save and Sync each render with a distinct variant class.
- [ ] Re-rendering the form into the same container leaves exactly one style
      block.
- [ ] Sync's disabled state while running is visibly distinct.
- [ ] `plugin.js` stays under the 30 KB guard.

## Out of scope

- Matching the firmware WebUI's exact colours or components.
- Restyling inputs, labels, status, or alert text.
