# Full-screen 3D office

The primary screen is the office itself. Remove the dashboard navigation,
metrics, headings, filters, legend and card frame. Keep the authenticated live
session connection. A quiet list button provides keyboard access and a WebGL
fallback. Session details appear only after selecting an agent, over the scene.

Use the existing React Three Fiber / Three.js renderer. Model a furnished
cutaway office with permanent workstations, a glass meeting room, lounge,
kitchenette, shelving, plants, window frames and daylight shadows. No room
image, external model, font or texture request. Active robots correspond only
to real sessions, with stable seat assignments.

Palette: oak #c5aa82, sage #8e9b83, plaster #d5d8c9, graphite #364440,
foliage #52775c, canvas #65766c. Existing system sans for small controls;
typography stays subordinate to the space. The room is the memorable element.

Layout: `viewport → full-bleed Canvas → cutaway office`. Pointer drag rotates,
wheel/pinch zooms, right drag/two-finger drag pans. Reset restores camera
position, target and zoom. The complete room fits initially on desktop and
portrait screens. No permanent side panels; the scene never resizes for a
session drawer.

Target viewports: 1440x1000 and 390x844. Respect reduced motion, keep 44px
touch controls, visible keyboard focus, accessible list selection, Escape
closing, and no document overflow. Loading uses a stable full-screen surface;
empty state keeps furniture visible; offline state retains last data; missing
WebGL opens the session list; partial telemetry is disclosed; authorization
uses the existing local-key form.

Agent markers are compact 22px circles. Provider, session ID and task are
shown on hover or keyboard focus; the session list remains the larger-touch
alternative. Preserve the display pixel ratio up to 2x, including under load.
Adapt mesh detail and shadows instead of lowering render resolution. Static
furniture instance matrices update only when the scene changes; robot parts
remain in an independent animated instance batch.

Implementation: simplify Dashboard, model permanent room furniture, enable
camera rotation/reset, add scoped full-screen CSS, then run typecheck, build,
existing tests and browser checks for viewport coverage, orbit/reset,
selection, live updates and WebGL fallback. Capture desktop/mobile evidence.
