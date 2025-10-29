// api/random.js
// Vercel serverless function that returns a single random image URL
// from the Unsplash user 'tabliss-official'.
// Requires UNSPLASH_ACCESS_KEY in environment variables.

export default async function handler(req, res) {
  const USERNAME = 'tabliss-official';
  const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

  if (!ACCESS_KEY) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Missing UNSPLASH_ACCESS_KEY env var' });
  }

  // Build Unsplash random-photo URL, limiting to the user and landscape orientation.
  // You can remove orientation or change it if you want.
  const unsplashUrl = `https://api.unsplash.com/photos/random?username=${encodeURIComponent(USERNAME)}&orientation=landscape`;

  try {
    const apiResp = await fetch(unsplashUrl, {
      headers: {
        'Authorization': `Client-ID ${ACCESS_KEY}`,
        'Accept-Version': 'v1'
      }
    });

    if (!apiResp.ok) {
      const bodyText = await apiResp.text().catch(() => '');
      console.error('Unsplash API returned non-OK:', apiResp.status, bodyText);
      // Pass some useful info to caller (but don't leak secrets)
      res.setHeader('Content-Type', 'application/json');
      return res.status(502).json({ error: 'Unsplash API error', status: apiResp.status });
    }

    const photo = await apiResp.json();

    // Pick a usable URL (regular preferred, fallback to full/raw)
    const maybeUrl = (photo && photo.urls && (photo.urls.regular || photo.urls.full || photo.urls.raw)) || null;
    if (!maybeUrl) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(502).json({ error: 'No usable image URL from Unsplash' });
    }

    // Optionally add resizing params (Unsplash uses imgix query params)
    const width = 1920;
    const params = `w=${width}&fit=crop`;
    const finalUrl = maybeUrl.includes('?') ? `${maybeUrl}&${params}` : `${maybeUrl}?${params}`;

    // CORS: allow your frontend to fetch this. In production, replace '*' with your origin.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    // Cache at Vercel edge for a short time to save API calls (adjust to taste).
    // s-maxage controls CDN (edge) caching. stale-while-revalidate gives graceful revalidation.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    // Return a compact payload. You can expand with photo.user, id, alt_description, etc.
    return res.status(200).json({
      url: finalUrl,
      id: photo.id,
      raw: photo.urls.raw || null,
      alt_description: photo.alt_description || null,
      username: photo.user && photo.user.username ? photo.user.username : USERNAME,
    });

  } catch (err) {
    console.error('Error in /api/random:', err && (err.stack || err.message || err));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
