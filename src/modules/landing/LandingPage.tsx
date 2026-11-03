/**
 * Landing do Sodalis. Regras de movimento em docs/landing/MOTION.md.
 * Não usa Firebase: carrega rápido e é segura para visitantes.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  FileSignature,
  Flower2,
  KeyRound,
  Landmark,
  Lock,
  Medal,
  Music,
  ScrollText,
  ShieldCheck,
  Target,
  Ticket,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from '../../brand.ts';

const EASE = [0.16, 1, 0.3, 1] as const;

const INK = '#0e100f';
const PAPER = '#f3ecdd';
const BRASS = '#c9a45a';

// ---------- Marca ----------
export function SodalisMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="none" stroke={BRASS} strokeWidth="1.5" />
      <circle cx="32" cy="32" r="25" fill="none" stroke={BRASS} strokeWidth="0.75" strokeDasharray="1.5 2.5" />
      <path d="M41 22c-2-3-5.5-4.5-9.5-4.5-5.5 0-9 3-9 7 0 9.5 19 5.5 19 15 0 4.5-4 7.5-10 7.5-4.5 0-8-1.8-10-5" fill="none" stroke={PAPER} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function Guilloche({ color, opacity = 0.18 }: { color: string; opacity?: number }) {
  const paths = [];
  for (let i = 0; i < 14; i++) {
    const a = 8 + i * 3.2;
    paths.push(<path key={i} d={`M0 ${60 + i * 6} C 80 ${10 + i * 4}, 160 ${110 - i * 2}, 240 ${50 + i * 5} S 400 ${20 + i * 7}, 480 ${70 + i * 3}`} fill="none" stroke={color} strokeWidth="0.6" opacity={opacity + (i % 3) * 0.04} transform={`rotate(${a / 6} 240 150)`} />);
  }
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 480 300" preserveAspectRatio="none" aria-hidden>
      {paths}
    </svg>
  );
}

// ---------- Palavras que se formam ----------
function Words({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <span className={className}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.08em] mr-[0.25em]">
          <motion.span
            className="inline-block"
            initial={reduce ? false : { y: '110%', rotate: 4 }}
            animate={{ y: '0%', rotate: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: delay + i * 0.08 }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  // O observador fica no invólucro: um alvo 100% recortado por clip-path nunca é dado como visível
  return (
    <motion.div className={className} initial={reduce ? false : 'hidden'} whileInView="show" viewport={{ once: true, margin: '-60px' }}>
      <motion.div
        variants={{ hidden: { clipPath: 'inset(0 0 100% 0)', y: 24 }, show: { clipPath: 'inset(0 0 0% 0)', y: 0 } }}
        transition={{ duration: 0.8, ease: EASE, delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ---------- Carteirinha do hero (white-label ao vivo) ----------
interface SampleSociety {
  name: string;
  subtitle: string;
  icon: LucideIcon;
  primary: string;
  secondary: string;
  accent: string;
  category: string;
}

const SAMPLES: SampleSociety[] = [
  { name: 'Sociedade de Canto Harmonia', subtitle: 'exemplo fictício', icon: Music, primary: '#1d3a2b', secondary: '#0d1d15', accent: '#d9b25f', category: 'Sócio efetivo' },
  { name: 'Sociedade de Atiradores Vale Verde', subtitle: 'exemplo fictício', icon: Target, primary: '#5b1f2a', secondary: '#2a0d13', accent: '#e0b973', category: 'Sócio atirador' },
  { name: 'Grupo Folclórico Raízes', subtitle: 'exemplo fictício', icon: Flower2, primary: '#1d2f5a', secondary: '#0c1430', accent: '#f08a6b', category: 'Dançarina' },
  { name: 'Sociedade de Ginástica Aurora', subtitle: 'exemplo fictício', icon: Medal, primary: '#22302f', secondary: '#0d1514', accent: '#5fd3c0', category: 'Atleta' },
];

function MiniQr({ seed, color }: { seed: number; color: string }) {
  // Padrão decorativo de QR (não é um código lido): a carteirinha real usa QR verdadeiro do servidor
  const cells: ReactNode[] = [];
  let x = seed * 9301 + 49297;
  for (let r = 0; r < 21; r++) {
    for (let c = 0; c < 21; c++) {
      const finder = (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7);
      x = (x * 9301 + 49297) % 233280;
      const on = finder ? (r % 6 === 0 || c % 6 === 0 || (r > 1 && r < 5 && c > 1 && c < 5) || (r > 1 && r < 5 && c > 15 && c < 19) || (r > 15 && r < 19 && c > 1 && c < 5) || r === 6 || c === 6 || r === 14 || c === 14) && !(r === 6 && c > 6 && c < 14) && !(c === 6 && r > 6 && r < 14) : x / 233280 > 0.52;
      if (on) cells.push(<rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill={color} />);
    }
  }
  return (
    <svg viewBox="0 0 21 21" className="w-full h-full" shapeRendering="crispEdges" aria-hidden>
      {cells}
    </svg>
  );
}

function HeroCard() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [12, -12]), { stiffness: 160, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-16, 16]), { stiffness: 160, damping: 18 });
  const glareX = useTransform(mx, [-0.5, 0.5], ['0%', '100%']);
  const [i, setI] = useState(0);
  const [sweep, setSweep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setSweep(s => s + 1);
      setTimeout(() => setI(v => (v + 1) % SAMPLES.length), 380);
    }, 2600);
    return () => clearInterval(id);
  }, [reduce]);

  const s = SAMPLES[i];
  const Icon = s.icon;
  return (
    <div
      ref={ref}
      className="relative mx-auto w-[300px] sm:w-[340px] [perspective:1200px]"
      onPointerMove={e => {
        if (reduce || !ref.current) return;
        const b = ref.current.getBoundingClientRect();
        mx.set((e.clientX - b.left) / b.width - 0.5);
        my.set((e.clientY - b.top) / b.height - 0.5);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, z: -400, rotateX: 30, y: 60 }}
        animate={{ opacity: 1, z: 0, rotateX: 0, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
        style={{ rotateX: reduce ? 0 : rx, rotateY: reduce ? 0 : ry, transformStyle: 'preserve-3d' }}
        className="relative aspect-[5/8] rounded-[28px] overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]"
      >
        <motion.div className="absolute inset-0" animate={{ background: `linear-gradient(150deg, ${s.primary}, ${s.secondary})` }} transition={{ duration: 0.01 }} />
        <Guilloche color={s.accent} />
        <motion.div className="absolute inset-0 pointer-events-none mix-blend-overlay" style={{ background: 'radial-gradient(circle at var(--gx) 20%, rgba(255,255,255,0.35), transparent 45%)', ['--gx' as string]: glareX }} />
        <div className="relative h-full flex flex-col items-center text-center p-6 text-white" style={{ transform: 'translateZ(40px)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ border: `1px solid ${s.accent}66`, color: s.accent }}>
            <Icon className="w-9 h-9" strokeWidth={1.5} />
          </div>
          <div className="mt-3 font-display text-[17px] leading-tight">{s.name}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-60 mt-1">{s.subtitle}</div>
          <div className="mt-5 w-24 h-28 rounded-xl overflow-hidden flex items-end justify-center" style={{ background: `${s.accent}22`, border: `1px solid ${s.accent}55` }}>
            <Users className="w-14 h-14 mb-2 opacity-60" strokeWidth={1.2} />
          </div>
          <div className="mt-4 text-lg font-semibold">Nome do Sócio</div>
          <div className="mt-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold" style={{ background: s.accent, color: INK }}>
            {s.category}
          </div>
          <div className="mt-auto w-full flex items-end justify-between">
            <div className="text-left text-[10px] leading-relaxed opacity-80">
              <div>Matrícula 0042</div>
              <div>Válida até 31/03/2027</div>
            </div>
            <div className="w-20 h-20 bg-white rounded-lg p-1.5">
              <MiniQr seed={i + 1} color={INK} />
            </div>
          </div>
        </div>
        <AnimatePresence>
          {!reduce && (
            <motion.div
              key={sweep}
              className="absolute inset-y-0 -left-1/2 w-1/2 pointer-events-none"
              style={{ background: `linear-gradient(90deg, transparent, ${SAMPLES[(i + 1) % SAMPLES.length].accent}, transparent)` }}
              initial={{ x: '0%', opacity: sweep === 0 ? 0 : 0.9 }}
              animate={{ x: '400%', opacity: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
            />
          )}
        </AnimatePresence>
      </motion.div>
      <div className="mt-5 flex justify-center gap-2" aria-hidden>
        {SAMPLES.map((x, k) => (
          <span key={x.name} className="w-2 h-2 rounded-full transition-all" style={{ background: k === i ? x.accent : '#ffffff30', width: k === i ? 22 : 8 }} />
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-white/50">Cada sociedade com seu nome, logo e cores. Exemplos fictícios.</p>
    </div>
  );
}

// ---------- Narrativa por rolagem ----------
interface Chapter {
  kicker: string;
  title: string;
  text: string;
  icon: LucideIcon;
  scene: (p: { reduce: boolean }) => ReactNode;
}

function SceneDor() {
  const items = ['Planilha de sócios.xlsx', 'Caderno de mensalidades', 'Recibos em papel', 'Grupo de mensagens', 'Ata da última assembleia'];
  return (
    <div className="relative w-full h-full">
      {items.map((t, k) => (
        <motion.div
          key={t}
          className="absolute left-1/2 top-1/2 w-56 px-4 py-3 rounded-xl text-sm shadow-xl"
          style={{ background: k % 2 ? '#e9e1cf' : PAPER, color: INK }}
          initial={{ x: '-50%', y: -260, rotate: 0, opacity: 0 }}
          animate={{ x: `${-50 + (k - 2) * 22}%`, y: `${-60 + k * 18}%`, rotate: (k - 2) * 7, opacity: 1 }}
          transition={{ duration: 0.7, ease: EASE, delay: k * 0.08 }}
        >
          {t}
        </motion.div>
      ))}
    </div>
  );
}

function SceneCard() {
  const [n, setN] = useState(60);
  useEffect(() => {
    const id = setInterval(() => setN(v => (v <= 1 ? 60 : v - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div className="w-48 h-48 bg-white rounded-2xl p-3" initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ duration: 0.7, ease: EASE }}>
        <MiniQr seed={n} color={INK} />
      </motion.div>
      <motion.div
        className="px-5 py-2 rounded-full text-lg font-bold flex items-center gap-2"
        style={{ background: '#16a34a', color: 'white' }}
        initial={{ scale: 2.2, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: -4 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
      >
        <BadgeCheck className="w-5 h-5" /> Válida
      </motion.div>
      <div className="text-sm text-white/70 tabular-nums">O código muda em {n}s</div>
    </div>
  );
}

function SceneFinance() {
  const bars = [42, 58, 50, 71, 64, 80];
  return (
    <div className="w-full max-w-sm">
      <svg viewBox="0 0 320 160" className="w-full" aria-hidden>
        {bars.map((h, k) => (
          <motion.rect key={k} x={20 + k * 48} width="26" rx="4" fill={k % 2 ? '#5b1f2a' : BRASS} initial={{ y: 150, height: 0 }} animate={{ y: 150 - h * 1.6, height: h * 1.6 }} transition={{ duration: 0.7, ease: EASE, delay: 0.1 + k * 0.06 }} />
        ))}
        <motion.path d="M20 110 C 70 90, 110 100, 150 70 S 240 40, 300 30" fill="none" stroke={PAPER} strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: EASE, delay: 0.3 }} />
      </svg>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-white/70">
        <div className="rounded-xl bg-white/5 p-2">Livro caixa sem apagar</div>
        <div className="rounded-xl bg-white/5 p-2">Pix copia e cola</div>
        <div className="rounded-xl bg-white/5 p-2">Prestação de contas</div>
      </div>
    </div>
  );
}

function SceneEvents() {
  return (
    <div className="relative w-72 h-64">
      {[0, 1, 2].map(k => (
        <motion.div
          key={k}
          className="absolute left-0 right-0 mx-auto w-64 h-24 rounded-2xl flex items-center px-5 gap-4"
          style={{ background: PAPER, color: INK, top: k * 64 }}
          initial={{ x: 240, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: k * 0.12 }}
        >
          <Ticket className="w-8 h-8" style={{ color: '#5b1f2a' }} />
          <div className="text-left">
            <div className="text-sm font-semibold">Baile de aniversário</div>
            <div className="text-xs opacity-60">Ingresso {String(k + 1).padStart(3, '0')}</div>
          </div>
          <motion.span className="ml-auto text-xs font-bold px-2 py-1 rounded-md" style={{ border: '2px solid #16a34a', color: '#16a34a' }} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6 + k * 0.25, duration: 0.4, ease: EASE }}>
            ENTROU
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

function SceneMinutes() {
  return (
    <div className="w-72 rounded-2xl p-6 shadow-2xl" style={{ background: PAPER, color: INK }}>
      <div className="font-display text-lg">Ata nº 012/2026</div>
      <div className="text-xs opacity-60 mb-4">Assembleia geral ordinária</div>
      {[90, 100, 80, 95, 60].map((w, k) => (
        <motion.div key={k} className="h-2 rounded bg-black/15 mb-2" initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.5, ease: EASE, delay: k * 0.12 }} />
      ))}
      <svg viewBox="0 0 220 50" className="w-full mt-4" aria-hidden>
        <motion.path d="M5 35 C 25 5, 35 45, 55 20 S 85 40, 100 25 M 120 35 C 135 10, 150 40, 165 22 S 195 30, 215 18" fill="none" stroke="#1d2f5a" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: EASE, delay: 0.7 }} />
      </svg>
      <div className="text-[10px] font-mono opacity-60 mt-2 break-all">SHA-256 do texto aprovado registrado</div>
    </div>
  );
}

function SceneSecurity() {
  const layers = ['Regras de acesso por papel', 'Escritas só pelo servidor', 'CPF cifrado (AES-256)', 'Auditoria de cada ação'];
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}>
        <Lock className="w-14 h-14" style={{ color: BRASS }} strokeWidth={1.4} />
      </motion.div>
      {layers.map((l, k) => (
        <motion.div key={l} className="w-72 text-center text-sm py-2.5 rounded-xl border" style={{ borderColor: `${BRASS}55`, background: '#ffffff08' }} initial={{ y: 30, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE, delay: 0.2 + k * 0.08 }}>
          {l}
        </motion.div>
      ))}
    </div>
  );
}

const CHAPTERS: Chapter[] = [
  { kicker: 'O problema', title: 'A diretoria muda. A papelada fica.', text: 'Cadastro em planilha, mensalidade no caderno, ata no computador de alguém. A cada posse, recomeça do zero.', icon: ScrollText, scene: () => <SceneDor /> },
  { kicker: 'Carteirinha', title: 'Uma carteirinha que não dá para falsificar com print.', text: 'Na tela, o QR muda a cada minuto. O arquivo baixado vale 24 horas. Se a carteirinha for suspensa, a portaria vê na hora.', icon: BadgeCheck, scene: () => <SceneCard /> },
  { kicker: 'Financeiro', title: 'Conta que fecha, sem lançamento sumindo.', text: 'Livro caixa por conta, cobranças em lote, Pix copia e cola e recibos. Erro se corrige com estorno, e tudo fica no histórico.', icon: Wallet, scene: () => <SceneFinance /> },
  { kicker: 'Eventos', title: 'Do orçamento ao último ingresso.', text: 'Orçado e realizado, lotes de ingresso, lista de convidados e check-in pelo QR, ligado ao livro caixa.', icon: Ticket, scene: () => <SceneEvents /> },
  { kicker: 'Atas e assembleias', title: 'A memória da sociedade, assinada.', text: 'Convocação, pauta, presença com quórum, ata com versões e assinatura eletrônica. Deliberação vira tarefa com responsável.', icon: FileSignature, scene: () => <SceneMinutes /> },
  { kicker: 'Segurança', title: 'Os dados dos sócios protegidos de verdade.', text: 'Cada sociedade isolada das outras, papéis com permissão por módulo e CPF cifrado. Pensado para a LGPD desde o início.', icon: ShieldCheck, scene: () => <SceneSecurity /> },
];

function Story() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = !!useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [idx, setIdx] = useState(0);
  useEffect(() => scrollYProgress.on('change', v => setIdx(Math.min(CHAPTERS.length - 1, Math.floor(v * CHAPTERS.length)))), [scrollYProgress]);
  const bar = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  if (reduce) {
    return (
      <section className="max-w-5xl mx-auto px-5 py-16 space-y-12">
        {CHAPTERS.map(c => (
          <div key={c.title} className="grid md:grid-cols-2 gap-6 items-center">
            <div>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: BRASS }}>{c.kicker}</div>
              <h3 className="font-display text-3xl mt-2">{c.title}</h3>
              <p className="text-white/70 mt-3">{c.text}</p>
            </div>
            <div className="h-72 flex items-center justify-center">{c.scene({ reduce })}</div>
          </div>
        ))}
      </section>
    );
  }

  const c = CHAPTERS[idx];
  return (
    <section ref={ref} style={{ height: `${CHAPTERS.length * 90}vh` }} className="relative" aria-label="Como o Sodalis ajuda">
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        <div className="max-w-6xl mx-auto w-full px-5 grid md:grid-cols-2 gap-8 items-center">
          <div className="relative min-h-[260px]">
            <div className="flex gap-1.5 mb-6" aria-hidden>
              {CHAPTERS.map((x, k) => (
                <span key={x.title} className="h-1 rounded-full transition-all duration-500" style={{ width: k === idx ? 40 : 14, background: k <= idx ? BRASS : '#ffffff25' }} />
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={idx} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} transition={{ duration: 0.5, ease: EASE }}>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em]" style={{ color: BRASS }}>
                  <c.icon className="w-4 h-4" /> {c.kicker}
                </div>
                <h3 className="font-display text-3xl sm:text-5xl leading-[1.05] mt-3">{c.title}</h3>
                <p className="text-white/70 mt-4 text-lg max-w-md">{c.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="h-[340px] sm:h-[420px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div key={idx} className="w-full h-full flex items-center justify-center" exit={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }} transition={{ duration: 0.35 }}>
                {c.scene({ reduce })}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <motion.div className="absolute bottom-0 left-0 h-0.5" style={{ width: bar, background: BRASS }} />
      </div>
    </section>
  );
}

// ---------- Seções ----------
const AUDIENCE = [
  'Sociedades de canto e corais',
  'Sociedades de ginástica',
  'Sociedades de tiro',
  'Grupos de danças e folclóricos',
  'Bandas e sociedades musicais',
  'Clubes e centros de tradição',
  'Associações sem fins lucrativos',
  'Grupos de teatro',
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Users, title: 'Sócios', text: 'Proposta online com aprovação, dependentes, importação de planilha sem duplicar e exportação registrada.' },
  { icon: BadgeCheck, title: 'Carteirinha digital', text: 'Online em tempo real, PDF e PNG de 24 horas, QR rotativo e modo portaria com câmera.' },
  { icon: Landmark, title: 'Financeiro', text: 'Livro caixa imutável, cobranças recorrentes, multa e juros, conciliação de extrato e relatórios para o conselho fiscal.' },
  { icon: CalendarDays, title: 'Agenda e avisos', text: 'Agenda com visões de mês, semana e dia, avisos segmentados com confirmação de leitura e feed para o Google Agenda.' },
  { icon: Ticket, title: 'Eventos e projetos', text: 'Orçado e realizado, ingressos, convidados, check-in, equipe e patrocinadores.' },
  { icon: ScrollText, title: 'Atas e assembleias', text: 'Edital, pauta, quórum, versões, assinatura eletrônica simples e PDF com a identidade da sociedade.' },
  { icon: Vote, title: 'Votações e eleições', text: 'Voto secreto, um por sócio, elegibilidade por adimplência e apuração automática.' },
  { icon: Music, title: 'Módulos culturais', text: 'Oficinas e turmas, reserva de espaços, patrimônio e trajes, editais e leis de incentivo, mandatos e homenagens.' },
];

const FAQ = [
  { q: 'O sócio precisa ter conta Google?', a: 'Não. A diretoria entra pela Conta Google, e o sócio pode entrar pela Conta Google ou por um link enviado ao e-mail, sem senha para decorar.' },
  { q: 'O que acontece com a carteirinha baixada se o sócio sair?', a: 'O arquivo não se apaga sozinho, mas o QR dele deixa de validar depois de 24 horas, ou na hora em que a carteirinha for suspensa. A portaria sempre confere pelo QR.' },
  { q: 'Cada sociedade vê só os próprios dados?', a: 'Sim. O isolamento é feito no banco e no servidor, não só na tela, e é testado automaticamente para cada tipo de dado.' },
  { q: 'Dá para usar com o nome, a logo e as cores da nossa sociedade?', a: 'Sim. Logo, cores, fontes, nomes usados (sócio, associado ou membro; mensalidade ou anuidade) e os módulos ligados são escolhidos por cada sociedade.' },
  { q: 'Quanto custa?', a: 'Os valores ainda estão sendo definidos. Solicite uma demonstração e conversamos sobre o tamanho da sua sociedade.' },
  { q: 'E a LGPD?', a: 'A sociedade é a controladora dos dados e a plataforma é a operadora. Os termos e a política de privacidade estão em revisão jurídica e serão publicados antes da contratação.' },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button className="w-full flex items-center justify-between gap-4 py-4 text-left cursor-pointer" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="font-medium">{q}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="text-white/70 pb-4 overflow-hidden">
            {a}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    document.title = `${BRAND.name}: gestão e carteirinha digital para sociedades culturais`;
    document.documentElement.removeAttribute('data-theme');
  }, []);
  const demoMail = `mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`Quero uma demonstração do ${BRAND.name}`)}&body=${encodeURIComponent('Nome da sociedade:\nCidade:\nNúmero aproximado de sócios:\nMelhor horário para conversar:')}`;

  return (
    <div style={{ background: INK, color: PAPER }} className="min-h-screen overflow-x-clip">
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur bg-[#0e100f]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
          <SodalisMark />
          <span className="font-display text-xl">{BRAND.name}</span>
          <nav className="hidden md:flex gap-6 ml-8 text-sm text-white/70" aria-label="Seções">
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#seguranca" className="hover:text-white">Segurança</a>
            <a href="#planos" className="hover:text-white">Planos</a>
            <a href="#perguntas" className="hover:text-white">Perguntas</a>
          </nav>
          <div className="flex-1" />
          <Link to="/entrar" className="px-3 sm:px-4 py-2 rounded-full text-sm font-semibold hover:bg-white/10">
            Entrar
          </Link>
          <Link to={BRAND.demoPath} className="hidden sm:inline-flex px-4 py-2 rounded-full text-sm font-semibold border border-white/20 hover:border-white/50">
            Ver sistema
          </Link>
          <a href={demoMail} className="hidden sm:inline-flex px-4 py-2 rounded-full text-sm font-semibold" style={{ background: BRASS, color: INK }}>
            Solicitar demonstração
          </a>
        </div>
      </header>

      <main>
        <section className="relative pt-28 sm:pt-36 pb-20">
          <div className="absolute inset-0 opacity-40 pointer-events-none" aria-hidden>
            <Guilloche color={BRASS} opacity={0.08} />
          </div>
          <div className="relative max-w-6xl mx-auto px-5 grid lg:grid-cols-[1.15fr_1fr] gap-12 items-center">
            <div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em]" style={{ color: BRASS }}>
                <span className="w-8 h-px" style={{ background: BRASS }} /> Para sociedades culturais
              </motion.div>
              <h1 className="font-display text-5xl sm:text-7xl leading-[0.95] mt-5">
                <Words text="Tradição que" />
                <br />
                <Words text="se organiza." delay={0.25} className="italic" />
              </h1>
              <Reveal delay={0.6}>
                <p className="mt-6 text-lg text-white/70 max-w-xl">
                  Sócios, carteirinha digital, financeiro, eventos, atas e votações num só lugar, com o nome, a logo e as cores da sua sociedade.
                </p>
              </Reveal>
              <Reveal delay={0.75}>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to={BRAND.demoPath} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold" style={{ background: PAPER, color: INK }}>
                    Ver sistema funcionando <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a href={demoMail} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold border border-white/20 hover:border-white/50">
                    Solicitar demonstração
                  </a>
                </div>
                <p className="mt-3 text-xs text-white/45">A demonstração usa só dados fictícios e roda no seu navegador.</p>
              </Reveal>
            </div>
            <HeroCard />
          </div>
        </section>

        <Story />

        <section className="max-w-6xl mx-auto px-5 py-24" aria-labelledby="para-quem">
          <Reveal>
            <h2 id="para-quem" className="font-display text-4xl sm:text-5xl max-w-2xl">Para quem mantém viva uma tradição.</h2>
          </Reveal>
          <div className="mt-10 flex flex-wrap gap-3">
            {AUDIENCE.map((a, k) => (
              <Reveal key={a} delay={k * 0.05}>
                <span className="inline-block px-5 py-3 rounded-full border border-white/15 text-white/85">{a}</span>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="recursos" className="max-w-6xl mx-auto px-5 py-24" aria-labelledby="recursos-t">
          <Reveal>
            <h2 id="recursos-t" className="font-display text-4xl sm:text-5xl">Tudo que a diretoria faz, num lugar só.</h2>
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, k) => (
              <Reveal key={f.title} delay={(k % 4) * 0.06}>
                <div className="h-full rounded-3xl p-6 border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition">
                  <f.icon className="w-6 h-6" style={{ color: BRASS }} />
                  <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm text-white/65">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="px-5 py-24" aria-labelledby="demo-t">
          <div className="max-w-6xl mx-auto rounded-[32px] p-8 sm:p-14 relative overflow-hidden" style={{ background: '#16261d' }}>
            <Guilloche color={BRASS} opacity={0.12} />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 id="demo-t" className="font-display text-4xl sm:text-5xl">Veja por dentro, antes de conversar.</h2>
                <p className="mt-4 text-white/75">Entre como sócio para ver a carteirinha, as cobranças e as votações, ou como diretoria para ver sócios, financeiro, eventos e atas. Tudo com dados fictícios, sem cadastro e sem login.</p>
              </div>
              <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:items-end">
                <Link to={`${BRAND.demoPath}?visao=socio`} className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-semibold" style={{ background: PAPER, color: INK }}>
                  <BadgeCheck className="w-5 h-5" /> Ver como sócio
                </Link>
                <Link to={`${BRAND.demoPath}?visao=diretoria`} className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-semibold border border-white/30">
                  <KeyRound className="w-5 h-5" /> Ver como diretoria
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="seguranca" className="max-w-6xl mx-auto px-5 py-24 grid lg:grid-cols-2 gap-12" aria-labelledby="seg-t">
          <Reveal>
            <h2 id="seg-t" className="font-display text-4xl sm:text-5xl">Segurança e LGPD sem letra miúda.</h2>
            <p className="mt-4 text-white/70">A sociedade é a controladora dos dados dos sócios. A plataforma é a operadora e não vê dados pessoais no dia a dia.</p>
          </Reveal>
          <ul className="space-y-4">
            {[
              'Cada sociedade isolada no banco e no servidor, com teste automático de acesso cruzado.',
              'Papéis com permissão por módulo; revogação vale na hora.',
              'CPF cifrado e mascarado; revelar fica registrado na auditoria.',
              'A validação do QR mostra só nome reduzido, categoria e validade.',
              'Consentimentos por finalidade, responsável legal para menores e pedido de exclusão pelo próprio sócio.',
              'Lançamentos financeiros e atas não se apagam: correção por estorno e por nova versão.',
            ].map((t, k) => (
              <Reveal key={t} delay={k * 0.05}>
                <li className="flex gap-3">
                  <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: BRASS }} />
                  <span className="text-white/85">{t}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </section>

        <section id="planos" className="max-w-6xl mx-auto px-5 py-24" aria-labelledby="planos-t">
          <Reveal>
            <h2 id="planos-t" className="font-display text-4xl sm:text-5xl">Planos do tamanho da sua sociedade.</h2>
            <p className="mt-3 text-white/60">Valores em definição. Os planos abaixo mostram o que entra em cada faixa.</p>
          </Reveal>
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {[
              { n: 'Essencial', d: 'Para começar a organizar.', f: ['Sócios e carteirinha digital', 'Avisos e agenda', 'Portaria com QR'] },
              { n: 'Completo', d: 'Para a diretoria inteira.', f: ['Tudo do Essencial', 'Financeiro e cobranças', 'Eventos, atas e votações', 'Módulos culturais'], hl: true },
              { n: 'Federação', d: 'Para várias sociedades juntas.', f: ['Tudo do Completo', 'Várias sociedades na mesma conta', 'Apoio na migração dos dados'] },
            ].map(p => (
              <Reveal key={p.n}>
                <div className="h-full rounded-3xl p-7 border" style={{ borderColor: p.hl ? BRASS : '#ffffff1a', background: p.hl ? '#ffffff08' : 'transparent' }}>
                  <div className="font-display text-2xl">{p.n}</div>
                  <p className="text-white/60 text-sm mt-1">{p.d}</p>
                  <div className="mt-5 text-sm text-white/50">Valor sob consulta</div>
                  <ul className="mt-5 space-y-2 text-sm">
                    {p.f.map(x => (
                      <li key={x} className="flex gap-2"><Check className="w-4 h-4 mt-0.5" style={{ color: BRASS }} />{x}</li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="perguntas" className="max-w-3xl mx-auto px-5 py-24" aria-labelledby="faq-t">
          <Reveal>
            <h2 id="faq-t" className="font-display text-4xl sm:text-5xl mb-8">Perguntas frequentes</h2>
          </Reveal>
          {FAQ.map(f => <FaqItem key={f.q} {...f} />)}
        </section>

        <section className="px-5 pb-28">
          <Reveal>
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="font-display text-4xl sm:text-6xl">Sua sociedade merece menos papel e mais encontro.</h2>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href={demoMail} className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-semibold" style={{ background: BRASS, color: INK }}>
                  Solicitar demonstração <ArrowRight className="w-4 h-4" />
                </a>
                <Link to={BRAND.demoPath} className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-semibold border border-white/25">
                  Ver sistema
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row gap-4 justify-between text-sm text-white/50">
          <div className="flex items-center gap-2"><SodalisMark size={22} /> {BRAND.name} {BRAND.year}</div>
          <div className="flex gap-5">
            <Link to="/privacidade" className="hover:text-white">Privacidade</Link>
            <Link to="/termos" className="hover:text-white">Termos</Link>
            <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-white">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
