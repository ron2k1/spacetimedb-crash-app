// layout.ts -- shared geometry for the dashboard chrome. After the tabbed redesign the old left rail
// and right-side panel are gone: a single full-width app bar (TopBar) sits at the top, and the body
// below it is ONE full-area stage -- the Marketplace storefront when `home` is set, or DashboardView
// for the active tab. These constants keep the app bar, the stage, and the prompt bar on one shared
// margin so their gutters line up as the window resizes.

// Shared edge inset for every fixed chrome element (app bar, stage, prompt bar) -- one margin so the
// left/right gutters always match.
export const EDGE_INSET = 16;

// Top of the body stage. Clears the fixed app bar: top:16 + ~56px bar height + a 16px gap.
export const CONTENT_TOP = 88;

// Bottom of the body stage. Clears the floating PromptBar pill at the bottom of the screen.
export const CONTENT_BOTTOM = 100;
