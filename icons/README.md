# TWOK Clinic PWA Icons

## Icon Files Required

For the PWA to work properly, you need PNG icon files in this `icons/` folder:

- `icon-72x72.png`
- `icon-96x96.png`
- `icon-128x128.png`
- `icon-144x144.png`
- `icon-152x152.png`
- `icon-192x192.png`
- `icon-384x384.png`
- `icon-512x512.png`

## How to Generate Icons

### Option 1: Use the Icon Generator (Recommended)

1. Open `generate-icons.html` in your browser
2. Click "Generate & Download Icons"
3. Save all downloaded files in this `icons/` folder

### Option 2: Use Online Tools

You can use online PWA icon generators:

1. **RealFaviconGenerator**: https://realfavicongenerator.net/
2. **PWA Icon Generator**: https://www.appicon.co/
3. **Icon Generator**: https://icon.kitchen/

Upload the `icon.svg` file from this folder and download the generated icons.

### Option 3: Manual Creation

Create a 512x512 PNG image with:
- Blue gradient background (#2563eb to #1d4ed8)
- White medical cross in the center
- "TWOK Clinic" text at the bottom

Then resize it to the required sizes listed above.

## Testing PWA

After adding the icons:

1. Serve the app via HTTPS (or localhost for development)
2. Open in Chrome/Edge
3. Look for the install prompt or click the install icon in the address bar
4. The app should install and work offline

## Notes

- PWA features require HTTPS in production (localhost works for development)
- Service worker will cache all static assets for offline use
- IndexedDB stores all data locally in the browser
