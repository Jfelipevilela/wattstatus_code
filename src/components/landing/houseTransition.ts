// Shared between the persistent host and the lazily loaded 3D scene. While
// `snapping` is true the scene jumps straight to its framing for the current
// route instead of easing, because the canvas is hidden mid-transition.
export const houseTransition = { snapping: false };
