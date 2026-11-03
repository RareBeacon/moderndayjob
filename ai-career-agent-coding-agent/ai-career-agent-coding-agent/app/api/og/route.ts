import React from 'react';
import { ImageResponse } from 'next/og';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function clean(value: string | null, fallback: string, maxLen: number): string {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return fallback;
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}...` : trimmed;
}

export async function GET(request: Request) {
  const ip = requestIp(request);
  const rate = await enforceRateLimit(`api:og:${ip}`, 60, '1 m', ip);
  if (!rate.allowed) return new Response('Rate limited', { status: 429 });
  const { searchParams } = new URL(request.url);
  const title = clean(
    searchParams.get('title'),
    'Find Verified Roles, Build ATS-Ready CVs & Apply with Control',
    96,
  );
  const eyebrow = clean(searchParams.get('eyebrow'), 'JOBIEST CAREER PLATFORM', 42).toUpperCase();
  const badge = clean(searchParams.get('badge'), 'jobiest.com', 38);

  const root = React.createElement(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        backgroundColor: '#0c162c',
        backgroundImage:
          'radial-gradient(circle at 88% 18%, rgba(248, 214, 77, 0.22) 0%, rgba(12, 22, 44, 0) 48%), radial-gradient(circle at 12% 88%, rgba(37, 99, 235, 0.28) 0%, rgba(12, 22, 44, 0) 52%)',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
    },
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 18px',
            borderRadius: '999px',
            backgroundColor: 'rgba(248, 214, 77, 0.14)',
            border: '1px solid rgba(248, 214, 77, 0.42)',
            color: '#f8d64d',
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '0.08em',
          },
        },
        eyebrow,
      ),
      React.createElement(
        'div',
        {
          style: {
            fontSize: '28px',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.02em',
          },
        },
        'Jobiest',
      ),
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
          maxWidth: '1020px',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            fontSize: title.length > 68 ? '52px' : '60px',
            fontWeight: 800,
            lineHeight: 1.14,
            letterSpacing: '-0.025em',
            color: '#f8fafc',
          },
        },
        title,
      ),
      React.createElement(
        'div',
        {
          style: {
            fontSize: '24px',
            lineHeight: 1.4,
            color: '#cbd5e1',
          },
        },
        'Verified jobs, 30 ISO A4 resume & CV templates, and 10 free career tools. Zero fabricated credentials.',
      ),
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '24px',
          borderTop: '1px solid rgba(148, 163, 184, 0.24)',
          fontSize: '22px',
          color: '#94a3b8',
        },
      },
      React.createElement('span', { style: { color: '#f8d64d', fontWeight: 700 } }, badge),
      React.createElement('span', null, 'Approval-first AI Career Agent'),
    ),
  );

  return new ImageResponse(root, {
    width: 1200,
    height: 630,
  });
}
