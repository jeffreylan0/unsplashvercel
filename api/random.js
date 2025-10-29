// api/random.js
// Vercel serverless function: returns a JSON { url: "<image-url>" }
// Picks a random image from the given Unsplash username (tabliss-official).
//
// Requirements:
// - Set the environment variable UNSPLASH_ACCESS_KEY in Vercel to your Unsplash access key.
// - Deploy to Vercel; the frontend will fetch `${VERCEL_BACKEND_URL}/api/random`.

export default async function handler(req, res) {
  // Replace this username if the account name is different
  const USERNAME = 'tabliss-official';

  const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!ACCESS_KEY) {
    return res.status(500).json({ error: 'Missing UNSPLASH_ACCESS_KEY environment variable' });
  }

  const perPage = 30; // number of photos to fetch from user (max 30 per Unsplash docs)
  const apiUrl = `https://api.unsplash.com/users/${encodeURIComponent(USERNAME)}/photos?per_page=${perPage}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        // Unsplash uses "Authorization: Client-ID <access_key>" or client_id query param.
        'Authorization': `Client-ID ${ACCESS_KEY}`,
        'Accept-Version': 'v1'
      },
      // don't use caching here; allow Vercel/caller to control caching via response headers
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Unsplash API error:', response.status, text);
      return res.status(502).json({ error: 'Unsplash API error', status: response.status });
    }

    const photos = await response.json();

    if (!Array.isArray(photos) || photos.length === 0) {
      return res.status(404).json({ error: 'No photos found for user' });
    }

    // pick random index
    const idx = Math.floor(Math.random() * photos.length);
    const photo = photos[idx];

    // Use a useful size — regular or full. 'regular' is appropriate for background.
    // Optionally append imgix params: ?w=1920&fit=crop — Unsplash images use imgix.
    const rawUrl = (photo && photo.urls && (photo.urls.regular || photo.urls.full || photo.urls.raw)) || null;

    if (!rawUrl) {
      return res.status(502).json({ error: 'No usable image URL returned by Unsplash' });
    }

    // Prepare the final URL (you can append width/fit params if you want)
    // If rawUrl already contains query params, append with & otherwise use ?
    const preferredUrl = (() => {
      const width = 1920;
      const params = `w=${width}&fit=crop`;
      return rawUrl.includes('?') ? `${rawUrl}&${params}` : `${rawUrl}?${params}`;
    })();

    // Set CORS so the browser can fetch this endpoint
    // Adjust Access-Control-Allow-Origin to restrict to your site in production
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    // Cache this response at the CDN edge for a short time (e.g., 1 hour)
    // but you can tune this. Stale-while-revalidate could be added if desired.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    return res.status(200).json({ url: preferredUrl, raw: rawUrl, source: 'unsplash', username: USERNAME });

  } catch (err) {
    console.error('Error in /api/random:', err && (err.stack || err.message || err));
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
