/** Página pública opcional da sociedade: história, diretoria atual, eventos abertos e "quero ser sócio". */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Globe, Instagram, Mail, MapPin, MessageCircle } from 'lucide-react';
import { useDoc, useList } from '../../app/DataContext.tsx';
import { OrgChartView } from '../orgchart/OrgChartView.tsx';
import type { OrgChartDoc } from '../../shared/types.ts';
import { useTenant } from '../../app/TenantContext.tsx';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import type { EventDoc, TermDoc } from '../../shared/types.ts';
import { Button, Card, EmptyState } from '../../ui/index.tsx';
import { useLogoSrc } from '../card/useLogoSrc.ts';

const safeUrl = (u?: string) => (u && /^https:\/\//i.test(u.trim()) ? u.trim() : undefined);

export default function PublicTenantPage() {
  const t = useTenant();
  const p = t.tenant.publicPage;
  const logo = useLogoSrc(t.tenant.branding.logoUrl);
  const cover = useLogoSrc(t.tenant.branding.coverUrl || '');
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const terms = useList<TermDoc>(p?.enabled && t.moduleOn('mandatos') ? P.terms(t.tenantId) : null, { where: [['current', '==', true]], limit: 1 });
  const events = useList<EventDoc>(p?.enabled && t.moduleOn('eventos') ? P.events(t.tenantId) : null, { where: [['publicListing', '==', true], ['start', '>=', nowIso]], orderBy: [['start', 'asc']], limit: 6 });
  const tz = t.tenant.timezone;
  const org = useDoc<OrgChartDoc>(p?.enabled && t.moduleOn('organograma') ? P.orgchart(t.tenantId) : null);

  if (!p?.enabled) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold">{t.tenant.name}</h1>
        <EmptyState title="Página pública desligada" text="Esta sociedade ainda não publicou a sua página." action={<Link to={t.to('entrar')}><Button variant="secondary">Entrar no portal</Button></Link>} />
      </div>
    );
  }

  const board = terms.data[0];
  const showOrg = !!org.data?.showOnPublicPage && org.data.positions.length > 0;
  const ev = events.data.filter(e => e.status !== 'cancelado');
  const wa = p.socials?.whatsapp?.replace(/\D/g, '');

  return (
    <div className="min-h-screen">
      <header className="relative overflow-hidden bg-brand text-on-brand">
        {t.tenant.branding.coverUrl && cover !== 'shield' && <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
        <div className="relative max-w-4xl mx-auto px-4 py-14 sm:py-20 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <span className="w-20 h-20 rounded-2xl bg-black/20 flex items-center justify-center shrink-0">
            <AssociationLogo logoKeyOrUrl={logo} className="w-14 h-14" />
          </span>
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: 'var(--sd-font)' }}>
              {t.tenant.name}
            </h1>
            <p className="text-sm opacity-90 flex items-center gap-2">
              {p.city && (
                <>
                  <MapPin className="w-4 h-4" aria-hidden /> {p.city}
                </>
              )}
              {p.foundedYear && <span>· desde {p.foundedYear}</span>}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link to={t.to('cadastro')}>
                <Button variant="accent" size="lg">
                  Quero ser {t.labels.member.toLowerCase()}
                </Button>
              </Link>
              <Link to={t.to('entrar')}>
                <Button variant="secondary" size="lg">
                  Já sou {t.labels.member.toLowerCase()}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        {p.about && (
          <section>
            <h2 className="text-xl font-bold mb-2">Quem somos</h2>
            <p className="text-muted whitespace-pre-line leading-relaxed">{p.about}</p>
          </section>
        )}
        {p.history && (
          <section>
            <h2 className="text-xl font-bold mb-2">Nossa história</h2>
            <p className="text-muted whitespace-pre-line leading-relaxed">{p.history}</p>
          </section>
        )}
        {showOrg && (
          <section>
            <h2 className="text-xl font-bold mb-3">{org.data!.title}</h2>
            <OrgChartView chart={org.data} />
          </section>
        )}
        {!showOrg && board && board.board.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-1">{t.labels.board}</h2>
            <p className="text-sm text-muted mb-3">{board.name}</p>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {board.board.map((b, i) => (
                <li key={i} className="p-3 rounded-xl bg-surface border border-line">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted">{b.roleName}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {ev.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-3">Próximos eventos abertos</h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {ev.map(e => (
                <li key={e.id}>
                  <Card className="h-full space-y-1">
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-xs text-muted flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" aria-hidden /> {formatDateTime(e.start, tz)}
                    </div>
                    {e.location && <div className="text-xs text-muted">{e.location}</div>}
                    {e.description && <p className="text-sm text-muted line-clamp-3">{e.description}</p>}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="flex flex-wrap gap-3 text-sm">
          {p.contactEmail && (
            <a href={`mailto:${p.contactEmail}`} className="inline-flex items-center gap-1.5 underline">
              <Mail className="w-4 h-4" aria-hidden /> {p.contactEmail}
            </a>
          )}
          {wa && (
            <a href={`https://wa.me/${wa.length <= 11 ? `55${wa}` : wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline">
              <MessageCircle className="w-4 h-4" aria-hidden /> WhatsApp
            </a>
          )}
          {safeUrl(p.socials?.instagram) && (
            <a href={safeUrl(p.socials?.instagram)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline">
              <Instagram className="w-4 h-4" aria-hidden /> Instagram
            </a>
          )}
          {safeUrl(p.socials?.facebook) && (
            <a href={safeUrl(p.socials?.facebook)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline">
              <Globe className="w-4 h-4" aria-hidden /> Facebook
            </a>
          )}
          {safeUrl(p.socials?.site) && (
            <a href={safeUrl(p.socials?.site)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline">
              <Globe className="w-4 h-4" aria-hidden /> Site
            </a>
          )}
        </section>
      </main>
    </div>
  );
}
