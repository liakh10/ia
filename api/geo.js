// GET /api/geo: whether the plant and surety features are offered to this visitor (SPEC §10). Vercel puts the visitor's country and
// region in request headers; nothing is stored. The program itself stays permissionless; this only gates the site's forms.
// The blocked list is the owner's decision (SPEC §13.3): the United States and the comprehensively sanctioned countries and regions.
const COUNTRIES = new Set(['US', 'CU', 'IR', 'KP', 'SY']);
const REGIONS = new Set(['UA-43', 'UA-14', 'UA-09', 'UA-40']); // Crimea, Donetsk, Luhansk, Sevastopol

export default function handler(req, res) {
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const region = String(req.headers['x-vercel-ip-country-region'] || '').toUpperCase();
  const blocked = COUNTRIES.has(country) || REGIONS.has(`${country}-${region}`);
  res.setHeader('cache-control', 'private, no-store');
  res.setHeader('content-type', 'application/json');
  res.status(200).send(JSON.stringify({ blocked, country: country || null }));
}
