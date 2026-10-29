# Fixed-angle office and live monitoring panels

The cutaway office uses a raised central work deck, server racks, a glass collaboration pod, a lounge platform and a console wing. Decorative wall displays do not represent live telemetry. Room expansion remains tied to the seat grid.
Visible sessions are arranged in deterministic project groups; project directory
distinguishes names when available. Explicit parent-child relationships between
visible sessions are drawn as lines; ambiguous or ended links are omitted.
Compact labels show the project, current action and known turn duration; above
eight agents they collapse to markers to keep the scene legible. Confirmed
attention adds a pulse and a task-board count, respecting reduced motion. Linear lights use visible wall
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

Confirmed fresh open sessions create robots, including idle sessions between turns.
Ended, historically unconfirmed and stale sessions do not. An already-open detail drawer survives session end.
The accessible agent list remains the WebGL fallback. Existing authentication,
text redaction, bounded summaries, full-detail loading, SSE resync, native pixel
density and adaptive geometry/shadows remain in place.

Target viewports are 1440x1000 and 390x844. Validate camera fit and constraints,
edge-agent focus between panels, keyboard focus restoration, task transitions,
partial/missing telemetry, offline/reconnect, authentication and WebGL fallback.
Capture rendered office, board and monitoring states after a production build.

Agent avatars use a local procedural mascot based on the supplied reference:
red fur, cream belly, floppy brown ears, large brown eyes, black glasses, swept
blond hair and navy shorts. Provider accents and existing attention indicators
remain. Static body, glasses and fur merge into one vertex-colored geometry,
instanced separately from the four animated arm pieces. Working agents type; attention raises a hand; reduced
motion holds a static pose. No remote model, texture or image request is needed.

Workstation furniture rotates 180 degrees and the seated mascot moves to the
matching chair. The mascot faces +Z and the monitor screen faces -Z; characters
look at their screens while their faces remain visible to the fixed camera.

Rendering is demand-driven. Only live working agents schedule typing frames,
capped at 20 FPS. Camera input and telemetry invalidate immediately. Empty and
attention-only rooms rest without a render loop; reduced motion and offline
state stop timed animation. Hidden documents switch the Canvas to `never` and
stop its animation timer, resuming on visibility. The memoized Office does not
rerender for the dashboard's one-second relative-time clock. Pixel density stays
at the existing native DPR limit; no blur or resolution reduction is introduced.
Shadow maps refresh when scene state changes and are reused during tiny arm
gestures. Camera movement reuses the same light-space shadow map. Scene metrics
record shadow refreshes alongside frame count and draw calls for verification.
Tool history, process samples and timestamp-only updates do not invalidate the
3D scene. The memo comparison includes the fields consumed by workstations,
mascots and their tooltips; DOM panels still receive all telemetry updates.
