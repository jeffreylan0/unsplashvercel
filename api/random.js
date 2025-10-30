// api/random.js
// Vercel Serverless Function — returns a single random Unsplash image
// from the collection with ID 1053828 (tabliss-official).
//
// Requirements:
// - Set UNSPLASH_ACCESS_KEY in your Vercel project's Environment Variables
// - Deploy to Vercel and call: GET https://<your-vercel>.vercel.app/api/random
//
// Supported query parameters:
// - ?orientation=landscape|portrait|squarish   (optional, forwarded to Unsplash)
// - ?w=NUMBER                                  (preferred width to append to returned URL; default 1920)

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*'); // tighten in production
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const COLLECTION_ID = '1053828'; // tabliss-official collection
  const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  const defaultWidth = 1920;

  if (!ACCESS_KEY) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Missing UNSPLASH_ACCESS_KEY environment variable' });
  }

  // parse optional query params
  const orientation = (req.query && req.query.orientation) ? String(req.query.orientation) : undefined;
  const widthParam = (req.query && req.query.w) ? Number(req.query.w) : defaultWidth;
  const w = Number.isFinite(widthParam) && widthParam > 0 ? Math.round(widthParam) : defaultWidth;

  // build Unsplash random-photo URL using collection
  const params = new URLSearchParams();
  params.set('collections', COLLECTION_ID);
  if (orientation) params.set('orientation', orientation);

  const unsplashUrl = `https://api.unsplash.com/photos/random?${params.toString()}`;

  try {
    const apiResp = await fetch(unsplashUrl, {
      headers: {
        'Authorization': `Client-ID ${ACCESS_KEY}`,
        'Accept-Version': 'v1'
      }
    });

    const text = await apiResp.text().catch(() => '');
    if (!apiResp.ok) {
      // try to parse JSON body for clarity
      let body = text;
      try { body = JSON.parse(text); } catch (e) { /* keep text */ }

      console.error('Unsplash API error', apiResp.status, body);
      res.setHeader('Content-Type', 'application/json');
      return res.status(502).json({ error: 'Unsplash API error', status: apiResp.status, detail: body });
    }
    const photo = JSON.parse(text);

    const maybeUrl = (photo && photo.urls && (photo.urls.regular || photo.urls.full || photo.urls.raw)) || null;
    if (!maybeUrl) {
      console.error('Unsplash returned no usable URL', photo);
      res.setHeader('Content-Type', 'application/json');
      return res.status(502).json({ error: 'No usable image URL from Unsplash' });
    }

    // Append width/fit params (Unsplash uses imgix)
    const paramsToAppend = `w=${w}&fit=crop`;
    const finalUrl = maybeUrl.includes('?') ? `${maybeUrl}&${paramsToAppend}` : `${maybeUrl}?${paramsToAppend}`;

    // CORS headers — tighten in production to your site origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    // Cache at edge (adjust to taste)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    const payload = {
      url: finalUrl,
      id: photo.id || null,
      raw: photo.urls && photo.urls.raw ? photo.urls.raw : null,
      alt_description: photo.alt_description || null,
      photographer: {
        name: (photo.user && (photo.user.name || photo.user.username)) || null,
        username: (photo.user && photo.user.username) || null,
        profile_url: (photo.user && photo.user.links && photo.user.links.html) ? photo.user.links.html : null
      },
      source: 'unsplash',
      collection_id: COLLECTION_ID
    };

    return res.status(200).json(payload);

  } catch (err) {
    console.error('Error in /api/random:', err && (err.stack || err.message || err));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
