import {
  IconSearch,
  IconDocument,
  IconUpload,
  IconBuilding,
  IconGradCap,
  IconStar,
  IconArrowRight,
} from './Icons';

const CARDS = [
  {
    icon: IconSearch,
    color: 'var(--jl-blue)',
    title: 'Bring the Job',
    body: 'Paste a job link you want. Your agent prepares the whole application.',
    href: '/applications',
  },
  {
    icon: IconDocument,
    color: 'var(--jl-green)',
    title: 'Build Your Profile',
    body: 'Showcase your skills, experience and what makes you unique.',
    href: '/signup',
  },
  {
    icon: IconUpload,
    color: 'var(--jl-purple)',
    title: 'Apply Easily',
    body: 'Submit your application in just a few clicks.',
    href: '/applications',
  },
  {
    icon: IconBuilding,
    color: 'var(--jl-gold)',
    title: '10 Free Tools',
    body: 'CV scanner, cover letter writer, interview prep and more. No card needed.',
    href: '/tools',
  },
  {
    icon: IconGradCap,
    color: 'var(--jl-cyan)',
    title: 'Career Resources',
    body: 'Get tips, guides and tools to help you succeed.',
    href: '/#tools',
  },
  {
    icon: IconStar,
    color: 'var(--jl-pink)',
    title: 'Success Stories',
    body: 'Real people. Real journeys. Real opportunities.',
    href: '/#about',
  },
];

export function JobletFeatureCards() {
  return (
    <section className="jl-features" aria-label="What you can do">
      <div className="jl-shell">
        <div className="jl-features-grid">
          {CARDS.map((c, i) => (
            <a
              className="jl-feature"
              href={c.href}
              key={c.title}
              id={c.title === '10 Free Tools' ? 'tools' : undefined}
              data-animate
              data-animate-delay={i * 60}
            >
              <span className="jl-feature-ico" style={{ background: c.color }}>
                <c.icon size={22} />
              </span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <span className="jl-feature-link" style={{ color: c.color }}>
                Learn More <IconArrowRight size={15} />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
