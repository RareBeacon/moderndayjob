import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { getUser } from '@/lib/auth';

const FALLBACK_LOCATIONS = [
  { city: 'Lagos', state_province: 'Lagos State', country: 'Nigeria', display_name: 'Lagos, Lagos State, Nigeria' },
  { city: 'Abuja', state_province: 'Federal Capital Territory', country: 'Nigeria', display_name: 'Abuja, Federal Capital Territory, Nigeria' },
  { city: 'Port Harcourt', state_province: 'Rivers State', country: 'Nigeria', display_name: 'Port Harcourt, Rivers State, Nigeria' },
  { city: 'London', state_province: 'England', country: 'United Kingdom', display_name: 'London, England, United Kingdom' },
  { city: 'Manchester', state_province: 'England', country: 'United Kingdom', display_name: 'Manchester, England, United Kingdom' },
  { city: 'New York', state_province: 'New York', country: 'United States', display_name: 'New York, New York, United States' },
  { city: 'San Francisco', state_province: 'California', country: 'United States', display_name: 'San Francisco, California, United States' },
  { city: 'Austin', state_province: 'Texas', country: 'United States', display_name: 'Austin, Texas, United States' },
  { city: 'Toronto', state_province: 'Ontario', country: 'Canada', display_name: 'Toronto, Ontario, Canada' },
  { city: 'Berlin', state_province: 'Berlin', country: 'Germany', display_name: 'Berlin, Berlin, Germany' },
  { city: 'Amsterdam', state_province: 'North Holland', country: 'Netherlands', display_name: 'Amsterdam, North Holland, Netherlands' },
  { city: 'Dubai', state_province: 'Dubai', country: 'United Arab Emirates', display_name: 'Dubai, Dubai, United Arab Emirates' },
  { city: 'Nairobi', state_province: 'Nairobi County', country: 'Kenya', display_name: 'Nairobi, Nairobi County, Kenya' },
  { city: 'Remote', state_province: 'Global', country: 'Worldwide', display_name: 'Remote (Worldwide)' },
];

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tax:locations:${ip}`, 120, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 25, 50);

  try {
    let query = supabaseAdmin
      .from('locations')
      .select('id, city, state_province, country, country_code, display_name, normalized_name')
      .eq('is_active', true)
      .limit(limit);

    if (q) {
      query = query.or(`normalized_name.ilike.%${q}%,city.ilike.%${q}%,country.ilike.%${q}%`);
    } else {
      query = query.order('city', { ascending: true });
    }

    const { data, error } = await query;

    if (!error && Array.isArray(data) && data.length > 0) {
      const sorted = [...data].sort((a, b) => {
        const aNorm = (a.normalized_name || a.display_name || '').toLowerCase();
        const bNorm = (b.normalized_name || b.display_name || '').toLowerCase();
        if (aNorm === q && bNorm !== q) return -1;
        if (bNorm === q && aNorm !== q) return 1;
        if (aNorm.startsWith(q) && !bNorm.startsWith(q)) return -1;
        if (bNorm.startsWith(q) && !aNorm.startsWith(q)) return 1;
        return aNorm.localeCompare(bNorm);
      });

      return NextResponse.json({
        locations: sorted.map((loc) => ({
          id: loc.id,
          city: loc.city,
          stateProvince: loc.state_province,
          country: loc.country,
          countryCode: loc.country_code,
          displayName: loc.display_name,
        })),
      });
    }
  } catch {}

  const filtered = FALLBACK_LOCATIONS.filter((loc) => {
    if (!q) return true;
    return (
      loc.city.toLowerCase().includes(q) ||
      loc.country.toLowerCase().includes(q) ||
      loc.display_name.toLowerCase().includes(q)
    );
  }).slice(0, limit);

  return NextResponse.json({
    locations: filtered.map((l) => ({
      displayName: l.display_name,
      city: l.city,
      stateProvince: l.state_province,
      country: l.country,
    })),
  });
}
