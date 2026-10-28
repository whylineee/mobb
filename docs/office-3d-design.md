# Fixed-angle office and live monitoring panels

The existing furnished cutaway office, palette, robots, seat allocation and
room expansion remain the primary surface. Linear lights use visible wall
cantilevers, crossbars and short hangers, with no ceiling covering the room.

The orthographic camera keeps the existing isometric angle at every viewport.
Drag pans along the floor, wheel/pinch and buttons zoom, and reset shows the
whole room. Minimum zoom fits the room and locks panning; maximum zoom is four
times that fit. A shared camera layout projects room bounds, accounts for tool
panels, clamps the logical floor target and preserves camera orientation for
all input paths, focus transitions and viewport changes. Selected agents stay
in the free area between desktop panels. Reduced motion skips focus animation.

Left tools are Office, Agents and Task Board; right tools are Statistics and
Source Health. Panels overlay the scene without remounting the Canvas. A left
panel and one right panel can coexist on desktop. Session details replace the
right tool. Narrow viewports show only one panel and restore the prior panel
and activating control when details close. Escape closes the most recent panel;
Office closes tools and restores the room. Buttons have labels, titles, pressed
states, visible focus and at least 44px touch targets.

A shared frontend selector groups confirmed open sessions by working, attention,
waiting for a prompt and unknown status. Task cards show provider, short session
ID, project, latest prompt preview and update time. Stale sessions are unknown;
ended and historically unconfirmed sessions do not enter the live board. A
stopped turn waits for another prompt; it does not claim task completion.
Selecting a card uses the existing full-detail endpoint and session drawer.

Statistics and the bottom counters use the same session population. Statistics
show provider/status counts, current-turn duration and available process CPU/RAM
per session. Missing measurements are unavailable, never zero. Source health
uses existing collector state, last signal/check times and dropped-event counts.
Offline data remains visible with its connection warning. Omitted sessions are
disclosed; counts describe the loaded overview, not a global historical total.
No public API, Session type, database, dependency or agent-control capability is
added. No task editing, history analytics, token counts or cost estimates.

Only confirmed live work and attention create robots. Idle, ended, historical
and stale sessions do not. An already-open detail drawer survives session end.
The accessible agent list remains the WebGL fallback. Existing authentication,
text redaction, bounded summaries, full-detail loading, SSE resync, native pixel
density and adaptive geometry/shadows remain in place.

Target viewports are 1440x1000 and 390x844. Validate camera fit and constraints,
edge-agent focus between panels, keyboard focus restoration, task transitions,
partial/missing telemetry, offline/reconnect, authentication and WebGL fallback.
Capture rendered office, board and monitoring states after a production build.
