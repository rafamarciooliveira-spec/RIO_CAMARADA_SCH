import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { Member } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  getBrasiliaDate,
  parseMemberBirthday,
  isBirthdayToday,
  isBirthdayThisWeek,
  isBirthdayNext7Days,
  isBirthdayInMonth,
  getWhatsAppCongratulationsUrl,
} from '../utils/birthdays.ts';
import {
  Cake,
  Calendar,
  Sparkles,
  Search,
  Printer,
  MessageCircle,
  ShieldCheck,
  ShieldAlert,
  Users,
  ChevronDown,
} from 'lucide-react';

interface BirthdaysViewProps {
  isAdminView?: boolean;
}

type FilterOption = 'hoje' | 'esta_semana' | 'proximos_7' | 'este_mes' | 'mes_especifico';

const MONTHS_LIST = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

export const BirthdaysView: React.FC<BirthdaysViewProps> = ({ isAdminView = false }) => {
  const { currentMember, activeTemplate } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterOption>('este_mes');
  const [selectedMonth, setSelectedMonth] = useState<number>(() => getBrasiliaDate().getMonth() + 1);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Fetch approved members
    const q = query(collection(db, 'members'), where('status', '==', 'aprovado'));
    const unsub = onSnapshot(
      q,
      snap => {
        const fetched: Member[] = [];
        snap.forEach(d => {
          fetched.push({ ...d.data(), id: d.id } as Member);
        });
        setMembers(fetched);
        setLoading(false);
      },
      err => {
        console.warn('Erro ao carregar aniversariantes:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Filter members based on user role, consent, search, and active date filter
  const filteredMembers = useMemo(() => {
    return members
      .filter(m => {
        // Members only see approved members who explicitly consented
        if (!isAdminView && !m.allowBirthdayPublic) {
          return false;
        }

        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = m.fullName.toLowerCase().includes(q);
          const matchPhone = m.phone ? m.phone.includes(q) : false;
          if (!matchName && !matchPhone) return false;
        }

        if (!m.birthDate) return false;

        switch (filter) {
          case 'hoje':
            return isBirthdayToday(m.birthDate);
          case 'esta_semana':
            return isBirthdayThisWeek(m.birthDate);
          case 'proximos_7':
            return isBirthdayNext7Days(m.birthDate);
          case 'este_mes': {
            const currentMonth = getBrasiliaDate().getMonth() + 1;
            return isBirthdayInMonth(m.birthDate, currentMonth);
          }
          case 'mes_especifico':
            return isBirthdayInMonth(m.birthDate, selectedMonth);
          default:
            return true;
        }
      })
      .sort((a, b) => {
        const parsedA = parseMemberBirthday(a.birthDate);
        const parsedB = parseMemberBirthday(b.birthDate);
        if (!parsedA || !parsedB) return 0;
        if (parsedA.month !== parsedB.month) {
          return parsedA.month - parsedB.month;
        }
        return parsedA.effectiveDay - parsedB.effectiveDay;
      });
  }, [members, isAdminView, filter, selectedMonth, searchQuery]);

  const todayCount = useMemo(() => {
    return members.filter(m => (isAdminView || m.allowBirthdayPublic) && m.birthDate && isBirthdayToday(m.birthDate)).length;
  }, [members, isAdminView]);

  const handlePrint = () => {
    window.print();
  };

  const associationName = activeTemplate?.associationName || 'Associação Esportiva e Cultural Rio Camarada';

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Cake className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Quadro de Aniversariantes
                {todayCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs bg-amber-500/20 text-amber-300 font-semibold rounded-full border border-amber-500/30">
                    {todayCount} hoje
                  </span>
                )}
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                {isAdminView
                  ? 'Gestão e envio de felicitações aos associados da sociedade'
                  : 'Celebre o dia especial dos nossos companheiros de tiro e tradição'}
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isAdminView && (
            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl border border-zinc-700 transition"
              title="Imprimir lista formatada para mural"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              Imprimir Lista
            </button>
          )}
        </div>
      </div>

      {/* Member Privacy Notice if non-admin */}
      {!isAdminView && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-300 leading-relaxed">
            <strong className="text-emerald-400">Privacidade Garantida (LGPD):</strong> Em respeito à sua privacidade, apenas o dia e o mês dos associados que concordaram expressamente com a divulgação são exibidos. O ano de nascimento e a idade nunca são compartilhados.
            {currentMember && !currentMember.allowBirthdayPublic && (
              <span className="block mt-1 text-amber-300">
                💡 Seu aniversário não está sendo exibido aos demais sócios. Você pode autorizar a qualquer momento na aba <strong>Meus Dados</strong>.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between no-print">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('hoje')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'hoje'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            🎉 Hoje {todayCount > 0 && `(${todayCount})`}
          </button>
          <button
            type="button"
            onClick={() => setFilter('esta_semana')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'esta_semana'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Esta Semana (Seg-Dom)
          </button>
          <button
            type="button"
            onClick={() => setFilter('proximos_7')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'proximos_7'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Próximos 7 Dias
          </button>
          <button
            type="button"
            onClick={() => setFilter('este_mes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'este_mes'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Este Mês
          </button>

          {/* Month Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={filter === 'mes_especifico' ? selectedMonth : ''}
              onChange={e => {
                setSelectedMonth(Number(e.target.value));
                setFilter('mes_especifico');
              }}
              className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-semibold transition outline-none cursor-pointer ${
                filter === 'mes_especifico'
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700/60'
              }`}
            >
              <option value="" disabled>
                Escolher Mês...
              </option>
              {MONTHS_LIST.map(m => (
                <option key={m.value} value={m.value} className="bg-zinc-900 text-white">
                  Mês: {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 pointer-events-none opacity-60" />
          </div>
        </div>

        {/* Search */}
        <div className="relative md:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Print-only Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-4 text-black">
        <h2 className="text-xl font-bold">{associationName}</h2>
        <h3 className="text-base font-semibold mt-1">Lista Oficial de Aniversariantes do Mês</h3>
        <p className="text-xs text-gray-600">
          Emitido em {getBrasiliaDate().toLocaleDateString('pt-BR')} às {getBrasiliaDate().toLocaleTimeString('pt-BR')} (Horário de Brasília)
        </p>
      </div>

      {/* Birthday Cards Grid */}
      {loading ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Carregando lista de aniversariantes...
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 p-8">
          <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-zinc-300">Nenhum aniversariante encontrado neste período</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
            {searchQuery
              ? 'Tente ajustar sua busca ou limpar o termo de pesquisa.'
              : 'Não há associados com data de aniversário para os filtros selecionados.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map(m => {
            const parsed = parseMemberBirthday(m.birthDate);
            const isToday = isBirthdayToday(m.birthDate);
            const whatsAppUrl = m.phone ? getWhatsAppCongratulationsUrl(m.phone, m.fullName, associationName) : '';

            return (
              <div
                key={m.id}
                className={`relative rounded-2xl p-4 transition border ${
                  isToday
                    ? 'bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-900 border-amber-500/50 shadow-lg shadow-amber-500/10'
                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Special Today Badge */}
                {isToday && (
                  <div className="absolute -top-2.5 right-4 px-2.5 py-0.5 bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-black text-[10px] tracking-wider uppercase rounded-full shadow flex items-center gap-1">
                    <Sparkles className="w-3 h-3 fill-zinc-950" />
                    Hoje!
                  </div>
                )}

                <div className="flex items-start gap-3.5">
                  {/* Photo or Initials */}
                  <div className="relative shrink-0">
                    {m.photoUrl ? (
                      <img
                        src={m.photoUrl}
                        alt={m.fullName}
                        className="w-14 h-14 rounded-full object-cover border-2 border-zinc-700"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-700 flex items-center justify-center font-bold text-white text-base border-2 border-zinc-600">
                        {m.fullName
                          .split(' ')
                          .slice(0, 2)
                          .map(w => w[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                    )}
                    {isToday && (
                      <div className="absolute -bottom-1 -right-1 p-1 bg-amber-500 text-zinc-950 rounded-full">
                        <Cake className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  {/* Member info */}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-white truncate">{m.fullName}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-amber-300 font-semibold">{parsed?.displayFormatted}</span>
                    </p>

                    <p className="text-[11px] text-zinc-500 mt-1 truncate">
                      {m.category || 'Sócio Efetivo'} • Matrícula: {m.membershipNumber || 'S/N'}
                    </p>

                    {/* Admin LGPD and Action Badges */}
                    {isAdminView && (
                      <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            m.allowBirthdayPublic
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                          title={
                            m.allowBirthdayPublic
                              ? 'Consentimento LGPD ativo para divulgação'
                              : 'Não autorizou divulgação aos demais sócios'
                          }
                        >
                          {m.allowBirthdayPublic ? (
                            <>
                              <ShieldCheck className="w-2.5 h-2.5" /> Divulgação OK
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-2.5 h-2.5" /> Privado
                            </>
                          )}
                        </span>

                        {whatsAppUrl ? (
                          <a
                            href={whatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-sm"
                            title="Enviar mensagem personalizada de parabéns pelo WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 fill-white" />
                            Parabéns
                          </a>
                        ) : (
                          <span className="text-[10px] text-zinc-500 italic">Sem telefone</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
