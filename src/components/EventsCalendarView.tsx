import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useAppDialog } from '../context/DialogContext.tsx';
import { SocietyEvent, SocietyEventType } from '../types/index.ts';
import { db } from '../firebase/config.ts';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ExcelEventsImporterModal } from './ExcelEventsImporterModal.tsx';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Lock,
  Sparkles,
  Clock,
  MapPin,
  FileText,
  FileSpreadsheet,
  Edit2,
  Trash2,
  X,
  Info,
  Shield,
  Crown,
  Eye,
  CheckCircle2,
  Building,
  Filter,
  ListFilter,
  Grid,
} from 'lucide-react';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const PRESET_LOCATIONS = [
  'Estande de Tiro 10m (Carabina de Ar / Chumbinho)',
  'Mastro do Tiro ao Pássaro de Madeira',
  'Salão de Festas & Baile Rio Camarada',
  'Espaço Gourmet & Churrasqueira',
  'Sede Social da Associação (Schroeder / SC)',
  'Cancha de Bocha & Jogos Tradicionais',
  'Sala de Reuniões da Diretoria',
];

// Initial starter events if collection is empty
const INITIAL_DEMO_EVENTS: Omit<SocietyEvent, 'id'>[] = [
  {
    title: 'Grande Festa de Rei e Rainha (Königsschießen) - Associação Rio Camarada',
    date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '23:30',
    type: 'sociedade',
    location: 'Salão de Festas & Baile Rio Camarada',
    notes: 'Tradicional desfile de busca do Rei com banda típica de sopro (Blaskapelle), almoço colonial típico, entrega de faixas e baile de coroação.',
    createdBy: 'Diretoria Executiva',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    title: 'Etapa de Tiro Esportivo - Carabina de Ar / Chumbinho (10 metros)',
    date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    startTime: '08:30',
    endTime: '16:00',
    type: 'sociedade',
    location: 'Estande de Tiro 10m (Carabina de Ar / Chumbinho)',
    notes: 'Competição oficial por equipes e individual. Categorias Sênior, Feminina, Masculina e Juvenil. Inscrições no estande.',
    createdBy: 'Departamento de Tiro',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    title: 'Almoço Festivo com Tiro ao Pássaro de Madeira e Tiro ao Dado',
    date: new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
    startTime: '11:30',
    endTime: '18:00',
    type: 'sociedade',
    location: 'Mastro do Tiro ao Pássaro de Madeira',
    notes: 'Confraternização familiar com marreco recheado e chopp artesanal. Disputa pelo título de Rei do Pássaro e baterias de tiro ao dado.',
    createdBy: 'Diretoria Cultural & Social',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    title: 'Locação Salão Social - Evento Particular (Terceiro)',
    date: new Date(Date.now() + 28 * 86400000).toISOString().split('T')[0],
    startTime: '15:00',
    endTime: '23:30',
    type: 'terceiro',
    location: 'Salão de Festas & Baile Rio Camarada',
    notes: 'Locação privada de espaço sob contrato nº 12/2026. Exclusividade do salão durante o período.',
    createdBy: 'Secretaria da Diretoria',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    title: 'Assembleia Geral Ordinária de Sócios & Prestação de Contas',
    date: new Date(Date.now() + 35 * 86400000).toISOString().split('T')[0],
    startTime: '19:30',
    endTime: '21:30',
    type: 'sociedade',
    location: 'Sede Social da Associação (Schroeder / SC)',
    notes: 'Apresentação do balanço financeiro, relatório das atividades culturais e esportivas e deliberações com os associados.',
    createdBy: 'Diretoria Executiva',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const EventsCalendarView: React.FC = () => {
  const { currentUser, currentMember, isAdmin, isSuperAdmin } = useAuth();
  const dialog = useAppDialog();

  // Permission check: Board Member or Admin can edit
  const isBoardMember = useMemo(() => {
    if (isAdmin || isSuperAdmin) return true;
    const cat = String(currentMember?.category || '').trim().toUpperCase();
    return cat === 'MEMBRO DA DIRETORIA';
  }, [isAdmin, isSuperAdmin, currentMember?.category]);

  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [viewFormat, setViewFormat] = useState<'calendar' | 'agenda'>('calendar');
  const [filterType, setFilterType] = useState<'all' | SocietyEventType>('all');

  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SocietyEvent | null>(null);
  const [viewingDetailEvent, setViewingDetailEvent] = useState<SocietyEvent | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('18:00');
  const [formType, setFormType] = useState<SocietyEventType>('sociedade');
  const [formLocation, setFormLocation] = useState(PRESET_LOCATIONS[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Real-time Firestore sync
  useEffect(() => {
    const path = 'events';
    const unsubscribe = onSnapshot(
      collection(db, path),
      snapshot => {
        const fetched: SocietyEvent[] = [];
        snapshot.forEach(docSnap => {
          fetched.push({ ...docSnap.data(), id: docSnap.id } as SocietyEvent);
        });
        // Sort by date ascending, then startTime
        fetched.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.startTime || '').localeCompare(b.startTime || '');
        });
        setEvents(fetched);
        setLoading(false);
      },
      error => {
        console.warn('Erro ao carregar eventos:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Seed starter events if empty
  const handleSeedStarterEvents = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      for (const item of INITIAL_DEMO_EVENTS) {
        const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await setDoc(doc(db, 'events', id), {
          ...item,
          id,
        });
      }
    } catch (e) {
      console.error('Erro ao gerar eventos de exemplo:', e);
    } finally {
      setLoading(false);
    }
  };

  // Calendar calculations
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const firstDayWeekday = useMemo(() => {
    return new Date(year, month, 1).getDay();
  }, [year, month]);

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setViewDate(today);
    setSelectedDateStr(today.toISOString().split('T')[0]);
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (filterType === 'all') return true;
      return e.type === filterType;
    });
  }, [events, filterType]);

  // Map events by date YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map: Record<string, SocietyEvent[]> = {};
    for (const evt of filteredEvents) {
      if (!map[evt.date]) {
        map[evt.date] = [];
      }
      map[evt.date].push(evt);
    }
    return map;
  }, [filteredEvents]);

  // Events for selected date
  const selectedDayEvents = useMemo(() => {
    return events.filter(e => e.date === selectedDateStr);
  }, [events, selectedDateStr]);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingDetailEvent) setViewingDetailEvent(null);
        if (showFormModal) setShowFormModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingDetailEvent, showFormModal]);

  // Open modal for new event
  const handleOpenNewEvent = (targetDate?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDate(targetDate || selectedDateStr || new Date().toISOString().split('T')[0]);
    setFormStartTime('09:00');
    setFormEndTime('18:00');
    setFormType('sociedade');
    setFormLocation(PRESET_LOCATIONS[0]);
    setFormNotes('');
    setFormError('');
    setShowFormModal(true);
  };

  // Open modal for editing event
  const handleOpenEditEvent = (evt: SocietyEvent) => {
    setEditingEvent(evt);
    setFormTitle(evt.title);
    setFormDate(evt.date);
    setFormStartTime(evt.startTime || '09:00');
    setFormEndTime(evt.endTime || '18:00');
    setFormType(evt.type);
    setFormLocation(evt.location || PRESET_LOCATIONS[0]);
    setFormNotes(evt.notes || '');
    setFormError('');
    setViewingDetailEvent(null);
    setShowFormModal(true);
  };

  // Save Event (Create or Update)
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError('Por favor informe o nome do evento.');
      return;
    }
    if (!formDate.trim()) {
      setFormError('Por favor informe a data do evento.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      const nowIso = new Date().toISOString();
      const eventId = editingEvent?.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const dataToSave: SocietyEvent = {
        id: eventId,
        title: formTitle.trim(),
        date: formDate.trim(),
        startTime: formStartTime.trim(),
        endTime: formEndTime.trim(),
        type: formType,
        location: formLocation.trim(),
        notes: formNotes.trim(),
        createdBy: editingEvent?.createdBy || currentUser?.email || 'Membro da Diretoria',
        createdByName: editingEvent?.createdByName || currentMember?.fullName || (isBoardMember ? 'Diretoria' : 'Admin'),
        createdAt: editingEvent?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, 'events', eventId), dataToSave);
      setShowFormModal(false);
      setSelectedDateStr(formDate.trim());
    } catch (err: any) {
      console.error('Erro ao salvar evento:', err);
      setFormError(err.message || 'Erro ao persistir evento no banco de dados.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = await dialog.confirm({
      title: 'Excluir Evento da Agenda',
      message: 'Tem certeza que deseja excluir este evento do calendário oficial?',
      confirmLabel: 'Excluir Evento',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'events', eventId));
      setViewingDetailEvent(null);
    } catch (err: any) {
      await dialog.alert({
        title: 'Erro ao Excluir Evento',
        message: 'Erro ao excluir evento: ' + (err.message || 'Falha no banco de dados.'),
        variant: 'danger',
      });
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Top Banner & Context Info */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-emerald-950/70 via-zinc-900 to-zinc-950 border border-emerald-500/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
              Agenda Oficial de Eventos & Ocupações
            </span>

            {isBoardMember ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 flex items-center gap-1">
                <Crown className="w-3 h-3" /> Gestão da Diretoria
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                Visualização do Associado
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-white">
            Calendário de Eventos & Espaços da Sociedade
          </h2>

          <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
            {isBoardMember ? (
              <span>
                Como membro da diretoria, você pode cadastrar, editar e visualizar todos os eventos.
                <strong> Eventos da Sociedade</strong> exibem o título oficial para todos os associados;
                <strong> Eventos de Terceiros</strong> exibem estritamente <code className="text-amber-300 font-mono">"Ocupado"</code> para sócios, resguardando a privacidade das locações.
              </span>
            ) : (
              <span>
                Acompanhe as assembleias, comemorações e torneios oficiais da entidade.
                As datas reservadas para locações particulares ou eventos externos constam sinalizadas como <strong className="text-amber-300">"Ocupado"</strong>.
              </span>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {events.length === 0 && !loading && (
            <button
              onClick={handleSeedStarterEvents}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 transition-colors cursor-pointer"
              title="Carregar eventos de demonstração para a agenda"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Carregar Exemplos</span>
            </button>
          )}

          {isBoardMember && (
            <>
              <button
                onClick={() => setShowExcelModal(true)}
                className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-bold text-xs tracking-wide shadow-md transition-all flex items-center gap-2 border border-zinc-700 cursor-pointer hover:border-emerald-500/50"
                title="Subir eventos em lote através de planilha Excel (.xlsx, .xls) ou CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Importar Excel</span>
              </button>

              <button
                onClick={() => handleOpenNewEvent()}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-950/60 transition-all flex items-center gap-2 cursor-pointer hover:scale-102"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Evento / Reserva</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Calendar Controls & Filter Toolbar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        {/* Navigation month & year */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <h3 className="text-base sm:text-lg font-bold text-white min-w-40 text-center capitalize">
            {MONTH_NAMES[month]} de {year}
          </h3>

          <button
            onClick={handleNextMonth}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleToday}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors ml-1 cursor-pointer"
          >
            Hoje
          </button>
        </div>

        {/* View toggles & Category filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category filter */}
          <div className="flex items-center bg-zinc-950/80 border border-zinc-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filterType === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todos ({events.length})
            </button>

            <button
              onClick={() => setFilterType('sociedade')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                filterType === 'sociedade'
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Building className="w-3 h-3" />
              <span>Sociedade</span>
            </button>

            <button
              onClick={() => setFilterType('terceiro')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                filterType === 'terceiro'
                  ? 'bg-amber-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>Ocupados</span>
            </button>
          </div>

          {/* Format switch: Calendar Grid vs Agenda List */}
          <div className="flex items-center bg-zinc-950/80 border border-zinc-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setViewFormat('calendar')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewFormat === 'calendar' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="Visualização em Grade Mensal"
            >
              <Grid className="w-4 h-4" />
            </button>

            <button
              onClick={() => setViewFormat('agenda')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewFormat === 'agenda' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="Visualização em Lista / Agenda"
            >
              <ListFilter className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Calendar View Area */}
      {viewFormat === 'calendar' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950/60 text-center py-2.5 text-xs font-bold text-zinc-400">
            {WEEKDAY_NAMES.map((w, idx) => (
              <div key={idx} className={idx === 0 || idx === 6 ? 'text-amber-400/80' : ''}>
                {w}
              </div>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr gap-px bg-zinc-800/60">
            {/* Blank padding days for previous month */}
            {Array.from({ length: firstDayWeekday }).map((_, idx) => (
              <div key={`blank-${idx}`} className="bg-zinc-950/40 min-h-24 sm:min-h-28 p-1.5 opacity-30 select-none" />
            ))}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayEvents = eventsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDateStr;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`bg-zinc-950 min-h-24 sm:min-h-28 p-1.5 sm:p-2 transition-colors relative flex flex-col justify-between cursor-pointer group hover:bg-zinc-900 ${
                    isSelected ? 'ring-2 ring-emerald-500 bg-zinc-900/90 z-10' : ''
                  }`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs sm:text-sm font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday
                          ? 'bg-emerald-500 text-zinc-950 font-black shadow-xs'
                          : isSelected
                          ? 'bg-zinc-800 text-emerald-400'
                          : 'text-zinc-300 group-hover:text-white'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {/* Quick add button for board members on hover */}
                    {isBoardMember && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenNewEvent(dateStr);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-zinc-800 hover:bg-emerald-600 text-zinc-400 hover:text-white transition-all"
                        title={`Agendar evento em ${dayNum}/${month + 1}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Event Badges list */}
                  <div className="space-y-1 mt-1 flex-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map(evt => {
                      const isSociedade = evt.type === 'sociedade';
                      // PRIVACY RULE: If event is "terceiro" and viewer is not board member, strictly display "Ocupado"
                      const displayTitle = isSociedade || isBoardMember ? evt.title : 'Ocupado';

                      return (
                        <div
                          key={evt.id}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedDateStr(dateStr);
                            setViewingDetailEvent(evt);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] truncate font-medium flex items-center gap-1 transition-transform hover:scale-[1.02] shadow-xs ${
                            isSociedade
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                          }`}
                          title={
                            isSociedade
                              ? `Evento da Sociedade: ${evt.title}`
                              : isBoardMember
                              ? `[Terceiro]: ${evt.title} (Exibido como "Ocupado" para sócios)`
                              : 'Horário / Espaço Ocupado'
                          }
                        >
                          {isSociedade ? (
                            <Building className="w-2.5 h-2.5 shrink-0 text-emerald-400" />
                          ) : (
                            <Lock className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                          )}
                          <span className="truncate">{displayTitle}</span>
                        </div>
                      );
                    })}

                    {dayEvents.length > 3 && (
                      <div className="text-[9px] text-zinc-400 font-medium pl-1">
                        +{dayEvents.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda / List Format */
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="font-bold text-white text-base">
              Agenda Completa de Eventos ({filteredEvents.length})
            </h3>
            <span className="text-xs text-zinc-400">Ordenado por data</span>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 space-y-2">
              <CalendarIcon className="w-8 h-8 mx-auto opacity-40 text-emerald-400" />
              <p className="text-sm">Nenhum evento registrado nesta categoria.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80 space-y-2">
              {filteredEvents.map(evt => {
                const isSociedade = evt.type === 'sociedade';
                const displayTitle = isSociedade || isBoardMember ? evt.title : 'Ocupado';

                return (
                  <div
                    key={evt.id}
                    onClick={() => setViewingDetailEvent(evt)}
                    className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl hover:bg-zinc-950/60 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 border ${
                          isSociedade
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {evt.date.split('-')[1]}/{evt.date.split('-')[2]}
                        </span>
                        {isSociedade ? (
                          <Building className="w-4 h-4 mt-0.5" />
                        ) : (
                          <Lock className="w-4 h-4 mt-0.5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                            {displayTitle}
                          </h4>

                          {isSociedade ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Sociedade
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> Ocupado (Terceiro)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                          {evt.startTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-zinc-500" />
                              {evt.startTime} {evt.endTime ? `às ${evt.endTime}` : ''}
                            </span>
                          )}
                          {evt.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-zinc-500" />
                              {evt.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className="text-xs text-zinc-400 group-hover:text-white transition-colors">
                        Ver detalhes →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected Day Events Section (Below Calendar) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-emerald-400" />
              Eventos de {selectedDateStr.split('-').reverse().join('/')}
            </h3>
            <p className="text-xs text-zinc-400">
              {selectedDayEvents.length === 0
                ? 'Nenhuma reserva ou evento cadastrado nesta data.'
                : `${selectedDayEvents.length} registro(s) encontrado(s)`}
            </p>
          </div>

          {isBoardMember && (
            <button
              onClick={() => handleOpenNewEvent(selectedDateStr)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Evento nesta Data</span>
            </button>
          )}
        </div>

        {selectedDayEvents.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/40" />
            <p className="text-sm text-zinc-400">Data livre para programações ou reservas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedDayEvents.map(evt => {
              const isSociedade = evt.type === 'sociedade';
              const displayTitle = isSociedade || isBoardMember ? evt.title : 'Ocupado';
              const displayNotes = isSociedade || isBoardMember ? evt.notes : null;

              return (
                <div
                  key={evt.id}
                  onClick={() => setViewingDetailEvent(evt)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative space-y-3 ${
                    isSociedade
                      ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60'
                      : 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {isSociedade ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <Building className="w-3 h-3" /> Evento da Sociedade
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Ocupado
                          </span>
                        )}

                        {!isSociedade && isBoardMember && (
                          <span className="text-[10px] font-mono text-zinc-400">
                            (Privacidade: Ocupado para sócios)
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-bold text-white mt-1.5 leading-snug">
                        {displayTitle}
                      </h4>
                    </div>

                    {isBoardMember && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleOpenEditEvent(evt);
                          }}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          title="Editar evento"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteEvent(evt.id);
                          }}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-400 transition-colors"
                          title="Excluir evento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-400 pt-1 border-t border-zinc-800/80">
                    {evt.startTime && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{evt.startTime} às {evt.endTime || 'fim'}</span>
                      </div>
                    )}

                    {evt.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="truncate">{evt.location}</span>
                      </div>
                    )}
                  </div>

                  {displayNotes ? (
                    <p className="text-xs text-zinc-300 bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-800/60 leading-relaxed line-clamp-2">
                      {displayNotes}
                    </p>
                  ) : !isSociedade && !isBoardMember ? (
                    <p className="text-xs text-zinc-500 italic bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-800/60">
                      Espaço reservado para locação particular ou evento externo.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: Visualizar Detalhes do Evento */}
      {viewingDetailEvent && (
        <div
          onClick={() => setViewingDetailEvent(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative cursor-default animate-scale-in"
          >
            <button
              onClick={() => setViewingDetailEvent(null)}
              className="absolute top-5 right-5 p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Badge & Title */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {viewingDetailEvent.type === 'sociedade' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5" /> Evento da Sociedade
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Ocupado (Terceiro)
                  </span>
                )}

                {viewingDetailEvent.type === 'terceiro' && isBoardMember && (
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40">
                    Visível como "Ocupado" para sócios
                  </span>
                )}
              </div>

              <h3 className="text-xl font-bold text-white">
                {viewingDetailEvent.type === 'sociedade' || isBoardMember
                  ? viewingDetailEvent.title
                  : 'Horário / Espaço Ocupado'}
              </h3>
            </div>

            {/* Event Info Grid */}
            <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800 space-y-3 text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-400" />
                <span>
                  <strong>Data:</strong> {viewingDetailEvent.date.split('-').reverse().join('/')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>
                  <strong>Horário:</strong> {viewingDetailEvent.startTime || 'Não especificado'} até {viewingDetailEvent.endTime || 'conclusão'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>
                  <strong>Espaço / Local:</strong> {viewingDetailEvent.location || 'Sede da Associação'}
                </span>
              </div>

              {isBoardMember && viewingDetailEvent.createdBy && (
                <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px] pt-2 border-t border-zinc-800">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>Cadastrado por: {viewingDetailEvent.createdByName || viewingDetailEvent.createdBy}</span>
                </div>
              )}
            </div>

            {/* Observations */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Observações & Detalhes
              </label>
              {viewingDetailEvent.type === 'sociedade' || isBoardMember ? (
                <div className="p-3.5 rounded-xl bg-zinc-950 text-xs text-zinc-200 border border-zinc-800 leading-relaxed whitespace-pre-line">
                  {viewingDetailEvent.notes || 'Sem observações adicionais para este evento.'}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-zinc-950 text-xs text-zinc-400 border border-zinc-800 leading-relaxed italic">
                  Este horário está reservado para um evento ou locação privada. Dados de contratos e identificação de terceiros são resguardados pela diretoria.
                </div>
              )}
            </div>

            {/* Actions for Board Member */}
            {isBoardMember && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  onClick={() => handleDeleteEvent(viewingDetailEvent.id)}
                  className="px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>

                <button
                  onClick={() => handleOpenEditEvent(viewingDetailEvent)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar Evento</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Formulário de Criação / Edição de Evento (Diretoria / Admin) */}
      {showFormModal && (
        <div
          onClick={() => setShowFormModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl my-8 relative cursor-default animate-scale-in"
          >
            <button
              onClick={() => setShowFormModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {editingEvent ? 'Edição de Evento' : 'Novo Evento / Reserva'}
              </span>
              <h3 className="text-xl font-bold text-white mt-1">
                {editingEvent ? 'Editar Informações do Evento' : 'Agendar Evento ou Ocupação'}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Defina se o evento pertence à entidade (nome visível) ou se é locação de terceiro (exibido apenas como Ocupado).
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEvent} className="space-y-4 text-xs">
              {/* Event Type Selector: Sociedade vs Terceiro */}
              <div className="space-y-2">
                <label className="font-bold text-zinc-300 uppercase tracking-wider block">
                  Classificação do Evento <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setFormType('sociedade')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      formType === 'sociedade'
                        ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-md'
                        : 'bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-emerald-400">
                      <Building className="w-4 h-4" />
                      <span>Da Sociedade</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Nome do evento visível no calendário para todos os sócios.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormType('terceiro')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      formType === 'terceiro'
                        ? 'bg-amber-950/50 border-amber-500 text-white shadow-md'
                        : 'bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-amber-400">
                      <Lock className="w-4 h-4" />
                      <span>De Terceiro (Locação)</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                      Para sócios comuns aparece apenas como <strong>"Ocupado"</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Event Title */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-300 uppercase tracking-wider block">
                  Nome do Evento <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder={
                    formType === 'sociedade'
                      ? 'Ex: Festa Junina dos Associados'
                      : 'Ex: Locação Salão Nobre - Casamento Família Silva'
                  }
                  required
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-xs"
                />
                {formType === 'terceiro' && (
                  <p className="text-[10px] text-amber-400/90 pt-0.5">
                    * Este nome só será visto pela Diretoria. No calendário dos sócios ficará apenas <strong>"Ocupado"</strong>.
                  </p>
                )}
              </div>

              {/* Date & Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 uppercase tracking-wider block">
                    Data do Evento <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    required
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 uppercase tracking-wider block">
                    Horário de Início
                  </label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={e => setFormStartTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 uppercase tracking-wider block">
                    Horário de Término
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={e => setFormEndTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              </div>

              {/* Location */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-300 uppercase tracking-wider block">
                  Espaço / Local Reservado
                </label>
                <div className="flex gap-2">
                  <select
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
                  >
                    {PRESET_LOCATIONS.map(loc => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Observations */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-300 uppercase tracking-wider block">
                  Observações & Anotações
                </label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={3}
                  placeholder={
                    formType === 'sociedade'
                      ? 'Pauta, orientações de vestimenta, programação ou detalhes para os sócios...'
                      : 'Anotações da diretoria: locatário, número de convidados, contrato, etc...'
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 text-xs resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? (
                    <span>Salvando no Banco...</span>
                  ) : (
                    <span>{editingEvent ? 'Salvar Alterações' : 'Confirmar Evento'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Importar Eventos via Planilha Excel / CSV */}
      {showExcelModal && (
        <ExcelEventsImporterModal
          isOpen={showExcelModal}
          onClose={() => setShowExcelModal(false)}
          onSuccess={() => setShowExcelModal(false)}
        />
      )}
    </div>
  );
};
