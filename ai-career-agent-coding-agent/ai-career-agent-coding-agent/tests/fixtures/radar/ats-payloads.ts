/**
 * Offline recorded-shape fixtures for all 11 authorized public ATS providers.
 * Zero live network calls in CI.
 */

export const GREENHOUSE_FIXTURE = JSON.stringify({
  jobs: [
    {
      id: 700101,
      internal_job_id: 50099,
      requisition_id: 'REQ-DUB-01',
      title: 'Staff Distributed Systems Engineer',
      updated_at: '2026-10-30T14:20:00Z',
      first_published: '2026-10-28T09:00:00Z',
      absolute_url: 'https://boards.greenhouse.io/stripe/jobs/700101',
      location: { name: 'Dublin, Ireland' },
      departments: [{ name: 'Core Infrastructure' }],
      content: '&lt;p&gt;Design &amp;amp; scale global payment ledgers in Go and Rust.&lt;/p&gt;',
      pay_input_ranges: [
        {
          min_cents: 14500000,
          max_cents: 18500000,
          currency_type: 'EUR',
          title: 'Annual Base Salary',
        },
      ],
    },
    {
      id: 700102,
      internal_job_id: 50100,
      requisition_id: 'REQ-BLR-02',
      title: 'Staff Distributed Systems Engineer',
      updated_at: '2026-10-30T14:25:00Z',
      absolute_url: 'https://boards.greenhouse.io/stripe/jobs/700102',
      location: { name: 'Bengaluru, India' },
      departments: [{ name: 'Core Infrastructure' }],
      content: '&lt;p&gt;Design &amp;amp; scale global payment ledgers in Go and Rust.&lt;/p&gt;',
    },
  ],
});

export const LEVER_US_FIXTURE = JSON.stringify([
  {
    id: 'ef9012ab-34cd-56ef-7890-abcdef123456',
    text: 'Senior Security Engineer',
    hostedUrl: 'https://jobs.lever.co/spotify/ef9012ab-34cd-56ef-7890-abcdef123456',
    applyUrl: 'https://jobs.lever.co/spotify/ef9012ab-34cd-56ef-7890-abcdef123456/apply',
    workplaceType: 'remote',
    country: 'SE',
    descriptionPlain: 'Harden cloud production infrastructure and detection pipelines.',
    lists: [{ text: 'Requirements', content: '<li>Kubernetes security</li><li>Threat modeling</li>' }],
    categories: {
      location: 'Stockholm',
      commitment: 'Full-time',
      department: 'Platform Security',
    },
    salaryRange: {
      min: 920000,
      max: 1150000,
      currency: 'SEK',
      interval: 'per-year-salary',
    },
    createdAt: 1761782400000,
  },
]);

export const LEVER_EU_FIXTURE = JSON.stringify([
  {
    id: 'eu-post-9988',
    text: 'Product Counsel, FinTech',
    hostedUrl: 'https://jobs.eu.lever.co/klarna-eu/eu-post-9988',
    workplaceType: 'hybrid',
    country: 'DE',
    descriptionPlain: 'Advise product engineering teams on European payments regulation.',
    categories: {
      location: 'Berlin, Germany',
      commitment: 'Full-time',
      team: 'Legal',
    },
    createdAt: 1761800000000,
  },
]);

/** Includes Ashby's real-world 2026 gotcha: `isRemote: true` on a `Hybrid` role! */
export const ASHBY_FIXTURE = JSON.stringify({
  organization: { name: 'Linear' },
  jobs: [
    {
      id: 'ashby-hybrid-01',
      title: 'Product Engineer',
      jobUrl: 'https://jobs.ashbyhq.com/linear/ashby-hybrid-01',
      applyUrl: 'https://jobs.ashbyhq.com/linear/ashby-hybrid-01/application',
      location: 'San Francisco, CA',
      workplaceType: 'Hybrid',
      isRemote: true,
      department: 'Engineering',
      employmentType: 'FullTime',
      descriptionHtml: '<p>Build fast collaborative software tools with TypeScript and WebGL.</p>',
      publishedAt: '2026-10-29T10:00:00.000Z',
      address: {
        postalAddress: {
          addressLocality: 'San Francisco',
          addressRegion: 'CA',
          addressCountry: 'US',
        },
      },
      compensation: {
        summaryComponents: [
          {
            compensationType: 'Salary',
            interval: '1 YEAR',
            currencyCode: 'USD',
            minValue: 180000,
            maxValue: 240000,
          },
        ],
      },
    },
  ],
});

export const WORKABLE_DETAILS_FIXTURE = JSON.stringify({
  name: 'Paystack Logistics Partner',
  jobs: [
    {
      title: 'Operations Lead',
      url: 'https://apply.workable.com/j/WK9911AA22',
      shortcode: 'WK9911AA22',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      country_code: 'NG',
      telecommuting: false,
      workplace_type: 'on_site',
      department: 'Operations',
      employment_type: 'Full-time',
      description: '<p>Lead regional merchant fulfillment across West Africa.</p>',
      requirements: '<ul><li>5+ years operations leadership</li></ul>',
      benefits: '<p>Comprehensive health cover.</p>',
      published_on: '2026-10-25',
    },
  ],
});

export const RECRUITEE_FIXTURE = JSON.stringify({
  offers: [
    {
      id: 88210,
      slug: 'backend-go-engineer',
      title: 'Backend Go Engineer',
      company_name: ' NordCloud Labs ',
      careers_url: 'https://nordcloudlabs.recruitee.com/o/backend-go-engineer',
      description: '<p>Build multi-tenant event streaming services.</p>',
      requirements: '<p>Strong Go and PostgreSQL internals.</p>',
      city: 'Amsterdam',
      country_code: 'NL',
      remote: false,
      hybrid: true,
      department: 'Backend',
      employment_type_code: 'full_time',
      published_at: '2026-10-15 09:30:00 UTC',
      salary: {
        min: 85000,
        max: 105000,
        currency: 'eur',
        period: 'yearly',
      },
    },
  ],
});

export const PERSONIO_XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
  <position>
    <id>441122</id>
    <subcompany>Celonis SE</subcompany>
    <office>Munich (Hybrid)</office>
    <department>Cloud Platform</department>
    <name>Site Reliability Engineer (m/f/d)</name>
    <employmentType>permanent</employmentType>
    <seniority>experienced</seniority>
    <createdAt>2026-10-27T08:15:00+00:00</createdAt>
    <jobDescriptions>
      <jobDescription>
        <name>Tasks</name>
        <value><![CDATA[<p>Operate mission-critical Kubernetes clusters across EU regions.</p>]]></value>
      </jobDescription>
      <jobDescription>
        <name>Qualifications</name>
        <value><![CDATA[<ul><li>Terraform &amp; Prometheus mastery</li></ul>]]></value>
      </jobDescription>
    </jobDescriptions>
  </position>
</workzag-jobs>`;

export const PINPOINT_FIXTURE = JSON.stringify({
  data: [
    {
      id: 'pp-772',
      title: 'Clinical Data Scientist',
      url: 'https://healthtech.pinpointhq.com/postings/pp-772',
      workplace_type: 'remote',
      employment_type_text: 'Full-time',
      description: '<p>Analyze longitudinal clinical trial outcomes.</p>',
      key_responsibilities: '<p>Build reproducible statistical pipelines in Python.</p>',
      compensation_visible: true,
      compensation_minimum: 110000,
      compensation_maximum: 140000,
      compensation_currency: 'GBP',
      compensation_frequency: 'annual',
      location: { name: 'London, United Kingdom', city: 'London', province: 'England' },
      job: { department: { name: 'Biostatistics' }, requisition_id: 'BIO-772' },
    },
  ],
});

export const GEM_FIXTURE = JSON.stringify({
  data: [
    {
      id: 'gem-post-44',
      internal_job_id: 'INT-44',
      title: 'Applied Research Engineer',
      absolute_url: 'https://jobs.gem.com/cohere-demo/gem-post-44',
      location: { name: 'Toronto, Canada' },
      location_type: 'HYBRID',
      employment_type: 'FULL_TIME',
      departments: [{ name: 'Research' }],
      content_plain: 'Train and evaluate multilingual retrieval models at scale.',
      first_published_at: '2026-10-29T12:00:00Z',
    },
  ],
});

export const POLYMER_FIXTURE = JSON.stringify({
  items: [
    {
      id: 9012,
      title: 'Founding Designer',
      job_post_url: 'https://jobs.polymer.co/acme-ai/9012',
      city: 'Nairobi',
      state_region: 'Nairobi County',
      country: 'Kenya',
      remoteness_pretty: 'Remote',
      kind_pretty: 'Full-Time',
      department: 'Design',
      description: '<p>Own product design across mobile and web financial workflows.</p>',
      published_at: '2026-10-26T07:00:00Z',
    },
  ],
});

export const BREEZY_FIXTURE = JSON.stringify([
  {
    id: 'brz-301',
    friendly_id: '301-devops',
    name: 'Cloud Infrastructure Engineer',
    url: 'https://payfintech.breezy.hr/p/brz-301-cloud-infrastructure-engineer',
    published_date: '2026-10-24T11:00:00Z',
    department: 'Infrastructure',
    description: '<p>Automate multi-region AWS deployments with OpenTofu.</p>',
    company: { name: 'PayFintech' },
    type: { name: 'Full-Time' },
    location: {
      name: 'Cape Town, ZA',
      city: 'Cape Town',
      country: { id: 'ZA', name: 'South Africa' },
      is_remote: true,
    },
  },
]);

export const TEAMTAILOR_RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/rss">
  <channel>
    <title>Sana Labs - Careers</title>
    <item>
      <guid>https://sanalabs.jobs.teamtailor.com/jobs/55109-backend-engineer</guid>
      <title>Backend Platform Engineer</title>
      <link>https://sanalabs.jobs.teamtailor.com/jobs/55109-backend-engineer</link>
      <description><![CDATA[<p>Build low-latency real-time knowledge indexing pipelines.</p>]]></description>
      <pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate>
      <tt:remoteStatus>hybrid</tt:remoteStatus>
      <tt:location>Stockholm, Sweden</tt:location>
      <tt:department>Engineering</tt:department>
    </item>
  </channel>
</rss>`;
