/**
 * Post-build script: injects apple-touch-icon, manifest, and theme-color
 * into dist/index.html after `expo export --platform web`.
 *
 * Expo's "single" output mode doesn't support +html.tsx customization,
 * so we patch the generated HTML directly.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.log('[postbuild] dist/index.html not found, skipping.');
  process.exit(0);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

const tags = [
  '<link rel="icon" href="/favicon.ico" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<link rel="manifest" href="/manifest.json" />',
  '<meta name="theme-color" content="#000000" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />',
  `<style>
    /* Mobile touch scrolling improvements */
    * { -webkit-tap-highlight-color: transparent; }
    html, body, #root {
      height: 100%;
      overflow: hidden;
      overscroll-behavior: none;
    }
    /* Enable smooth momentum scrolling on iOS */
    [data-testid="flatlist"], [role="list"] {
      -webkit-overflow-scrolling: touch;
      overflow-y: auto !important;
      touch-action: pan-y;
    }
    /* Prevent pull-to-refresh on mobile */
    body { overscroll-behavior-y: contain; }
  </style>`,
];

// Only add tags that aren't already present
const newTags = tags.filter((tag) => !html.includes(tag));

if (newTags.length > 0) {
  html = html.replace('</head>', newTags.join('') + '</head>');
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log('[postbuild] Injected into dist/index.html:', newTags.length, 'tags');
} else {
  console.log('[postbuild] All tags already present in dist/index.html');
}
