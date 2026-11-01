import { describe, expect, it } from 'vitest';
import { extractCareerPageIntelligence } from '@/lib/radar/adapters/jsonld';
import { inspectExternalFormHtml } from '@/lib/radar/forms/inspector';

describe('Career-Page JSON-LD Extractor & Hiring Infrastructure Discovery', () => {
  it('parses @graph JobPosting objects, skips expired validThrough postings, and discovers outbound ATS/Form links', () => {
    const html = `<!doctype html>
<html>
<head>
  <title>Careers at PayGrid</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "JobPosting",
        "identifier": { "@type": "PropertyValue", "value": "PG-2026-01" },
        "title": "Senior Infrastructure Engineer",
        "description": "<p>Architect multi-region payment gateways with zero downtime.</p>",
        "datePosted": "2026-10-28",
        "validThrough": "2026-12-31T23:59:59Z",
        "jobLocationType": "TELECOMMUTE",
        "employmentType": ["FULL_TIME"],
        "hiringOrganization": { "@type": "Organization", "name": "PayGrid Technologies" },
        "jobLocation": {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Lagos",
            "addressCountry": "NG"
          }
        },
        "baseSalary": {
          "@type": "MonetaryAmount",
          "currency": "USD",
          "value": { "@type": "QuantitativeValue", "minValue": 95000, "maxValue": 130000, "unitText": "YEAR" }
        },
        "url": "/careers/senior-infrastructure-engineer"
      },
      {
        "@type": "JobPosting",
        "identifier": "PG-EXPIRED-99",
        "title": "Old Summer Intern",
        "description": "<p>Closed role from earlier cycle.</p>",
        "validThrough": "2026-08-01T00:00:00Z"
      }
    ]
  }
  </script>
</head>
<body>
  <a href="https://jobs.ashbyhq.com/paygrid">View all engineering openings</a>
  <a href="https://tally.so/r/w7Kp9A">Graduate fellowship form</a>
</body>
</html>`;

    const res = extractCareerPageIntelligence({
      pageUrl: 'https://paygrid.example.com/careers',
      sourceId: 'jsonld_career:paygrid.example.com',
      companyFallback: 'PayGrid',
      html,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
    });

    expect(res.indexingBlocked).toBe(false);
    expect(res.expiredExternalIds).toEqual(['PG-EXPIRED-99']);
    expect(res.postings).toHaveLength(1);
    expect(res.postings[0]).toMatchObject({
      externalId: 'PG-2026-01',
      companyName: 'PayGrid Technologies',
      title: 'Senior Infrastructure Engineer',
      workplaceType: 'REMOTE',
      countryCode: 'NG',
      salaryMin: 95000,
      salaryMax: 130000,
      salaryCurrency: 'USD',
      url: 'https://paygrid.example.com/careers/senior-infrastructure-engineer',
    });

    expect(res.discoveredInfrastructure.map((d) => `${d.providerKey}:${d.boardOrFormToken}`)).toEqual([
      'ashby:paygrid',
      'tally_form:w7Kp9A',
    ]);
  });

  it('respects meta noindex on career pages and returns zero postings', () => {
    const res = extractCareerPageIntelligence({
      pageUrl: 'https://paygrid.example.com/private-Preview',
      sourceId: 'jsonld_career:paygrid.example.com',
      companyFallback: 'PayGrid',
      html: '<html><head><meta name="robots" content="noindex"></head><body></body></html>',
    });
    expect(res.indexingBlocked).toBe(true);
    expect(res.postings).toHaveLength(0);
  });
});

describe('Read-Only External Application Form Inspector', () => {
  it('extracts Google Forms FB_PUBLIC_LOAD_DATA_ questions without submitting and enforces requiresHumanApproval=true', () => {
    const fbSkeleton = JSON.stringify([
      null,
      [
        ' Apply to join Acme Studio ',
        [
          [101, 'Full Name', null, 0, [[200101, null, 1]]],
          [102, 'Work Email Address', null, 0, [[200102, null, 1]]],
          [103, 'Why do you want to build with us?', null, 1, [[200103, null, 1]]],
          [104, 'Upload your Resume (PDF)', null, 13, [[200104, null, 1]]],
        ],
        null,
        null,
        null,
        null,
        null,
        null,
        'Acme Studio - Founding Product Engineer Application',
      ],
    ]);

    const html = `<!doctype html><html><head><title>Google Forms</title></head><body>
      <script>var FB_PUBLIC_LOAD_DATA_ = ${fbSkeleton};</script>
    </body></html>`;

    const inspected = inspectExternalFormHtml({
      formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeValidForm/viewform',
      html,
      httpStatus: 200,
    });

    expect(inspected.provider).toBe('GOOGLE_FORM');
    expect(inspected.formTitle).toBe('Acme Studio - Founding Product Engineer Application');
    expect(inspected.formClosed).toBe(false);
    expect(inspected.requiresLogin).toBe(false);
    expect(inspected.collectsEmail).toBe(true);
    expect(inspected.requestsFileUpload).toBe(true);
    expect(inspected.requestsSensitiveId).toBe(false);
    expect(inspected.requestsPayment).toBe(false);
    expect(inspected.requiresHumanApproval).toBe(true);
    expect(inspected.questions).toHaveLength(4);
    expect(inspected.questions[0]).toEqual({
      id: 'entry.200101',
      label: 'Full Name',
      required: true,
      fieldType: 'SHORT_TEXT',
    });
  });

  it('detects closed forms and flags sensitive government ID or fee questions on external forms', () => {
    const closedAndRisky = inspectExternalFormHtml({
      formUrl: 'https://tally.so/r/scamForm99',
      html: `<html><head><title>Closed Form</title></head><body>
        <p>This form is no longer accepting responses.</p>
        <label>National Identification Number (NIN) *</label>
        <label>Upload proof of payment for registration fee *</label>
      </body></html>`,
      httpStatus: 200,
    });

    expect(closedAndRisky.provider).toBe('TALLY_FORM');
    expect(closedAndRisky.formClosed).toBe(true);
    expect(closedAndRisky.requestsSensitiveId).toBe(true);
    expect(closedAndRisky.requestsPayment).toBe(true);
    expect(closedAndRisky.requiresHumanApproval).toBe(true);
  });
});
