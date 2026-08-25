import { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CheckCircle2,
  AlertCircle,
  Droplets,
  Lock,
  HeartPulse,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Edit3,
  X,
  Save,
  Search,
  Users,
  User,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { dailyRoundsService } from '../../services/dailyRoundsService';
import type { Animal, DailyRound } from '../../types';

const CATEGORY_TABS = [
  { id: 'OWL', label: 'Owl' },
  { id: 'RAPTOR', label: 'Raptor' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotics' },
] as const;

const generateOfflineUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isValidDateString = (dateString: string): boolean => {
  if (!dateString || dateString.length !== 10) return false;
  const d = new Date(dateString);
  return d instanceof Date && !Number.isNaN(d.getTime());
};

const getAnimalsOptions = () =>
  queryOptions({
    queryKey: ['animals', 'husbandry'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').order('name');
      if (error) throw error;
      return (data || []) as Animal[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

const getRoundsOptions = (date: string, shift: 'MORNING' | 'AFTERNOON') =>
  queryOptions({
    queryKey: ['rounds', date, shift],
    queryFn: () => dailyRoundsService.getRoundsByDateAndShift(date, shift),
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

export const Route = createFileRoute('/husbandry/rounds')({
  loader: async ({ context }) => {
    const today = getLocalDateString();
    const shift = new Date().getHours() < 12 ? 'MORNING' : 'AFTERNOON';

    await Promise.all([
      context.queryClient.ensureQueryData(getAnimalsOptions()),
      context.queryClient.ensureQueryData(getRoundsOptions(today, shift)),
    ]);
  },
  component: DailyRounds,
});

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false));
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  return isMobile;
}

function DailyRounds() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const parentRef = useRef<HTMLDivElement>(null);

  const [activeDate, setActiveDate] = useState<string>(() => getLocalDateString());
  const [inputDate, setInputDate] = useState<string>(() => getLocalDateString());
  const [activeShift, setActiveShift] = useState<'MORNING' | 'AFTERNOON'>(() =>
    new Date().getHours() < 12 ? 'MORNING' : 'AFTERNOON'
  );

  const [activeTab, setActiveTab] = useState<string>('OWL');
  const [searchQuery, setSearchQuery] = useState('');

  const [draftRounds, setDraftRounds] = useState<Record<string, Partial<DailyRound>>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Note Modal State
  const [noteModalState, setNoteModalState] = useState<{
    isOpen: boolean;
    animal: Animal | null;
    round: DailyRound | null;
    currentNote: string;
  }>({
    isOpen: false,
    animal: null,
    round: null,
    currentNote: '',
  });

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: rounds = [], isLoading: loadingRounds } = useQuery(getRoundsOptions(activeDate, activeShift));

  const isLoading = loadingAnimals || loadingRounds;

  // Real-time synchronization
  useEffect(() => {
    const channel = supabase
      .channel('rounds_sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_rounds',
          filter: `date=eq.${activeDate}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rounds', activeDate, activeShift] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeDate, activeShift, queryClient]);

  // O(1) Hash Map Optimization
  const roundsMap = useMemo(() => {
    const map = new Map<string, DailyRound>();
    rounds.forEach((r) => map.set(r.animal_id, r));
    return map;
  }, [rounds]);

  // Filter animals strictly by selected category
  const displayAnimals = useMemo(() => {
    let filtered = animals.filter((a) => a.status !== 'ARCHIVED');

    filtered = filtered.filter((a) => {
      const cat = (a.category || '').toUpperCase();
      if (activeTab === 'EXOTIC') {
        return cat === 'EXOTIC' || cat === 'EXOTICS';
      }
      return cat === activeTab;
    });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.species?.toLowerCase().includes(q) ||
          a.ring_number?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [animals, activeTab, searchQuery]);

  // Virtualizer Setup
  const virtualizer = useVirtualizer({
    count: displayAnimals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? 120 : 64),
    overscan: 6,
  });

  const handleDateChange = (newDate: string) => {
    if (isValidDateString(newDate)) {
      setActiveDate(newDate);
      setInputDate(newDate);
      setDraftRounds({});
      setHasUnsavedChanges(false);
    } else {
      setInputDate(activeDate);
    }
  };

  const shiftDate = (days: number) => {
    const parts = activeDate.split('-');
    if (parts.length !== 3) return;
    const [y, m, d] = parts.map(Number);
    const dateObj = new Date(y!, m! - 1, d!, 12, 0, 0);
    dateObj.setDate(dateObj.getDate() + days);
    handleDateChange(getLocalDateString(dateObj));
  };

  const jumpToToday = () => {
    handleDateChange(getLocalDateString());
  };

  const handleToggle = (animalId: string, field: keyof DailyRound) => {
    setDraftRounds((prev) => {
      const existingDraft = prev[animalId];
      const dbRound = roundsMap.get(animalId);

      const currentState =
        existingDraft?.[field] !== undefined
          ? existingDraft[field]
          : (dbRound?.[field] ?? (field === 'is_alive' ? true : false));

      const newState = !currentState;

      return {
        ...prev,
        [animalId]: {
          ...prev[animalId],
          animal_id: animalId,
          [field]: newState,
        },
      };
    });
    setHasUnsavedChanges(true);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Authentication Error: You must be logged in to submit rounds.');
      return;
    }

    try {
      setIsSubmitting(true);

      const roundsToSubmit: Partial<DailyRound>[] = Object.values(draftRounds).map((draft) => {
        const dbRound = roundsMap.get(draft.animal_id!);
        const isEdit = Boolean(dbRound?.id);

        return {
          id: dbRound?.id || generateOfflineUUID(),
          animal_id: draft.animal_id,
          date: activeDate,
          shift: activeShift,
          is_alive: draft.is_alive !== undefined ? draft.is_alive : (dbRound?.is_alive ?? true),
          water_checked:
            draft.water_checked !== undefined ? draft.water_checked : (dbRound?.water_checked ?? false),
          locks_secured:
            draft.locks_secured !== undefined ? draft.locks_secured : (dbRound?.locks_secured ?? false),
          animal_issue_note:
            draft.animal_issue_note !== undefined ? draft.animal_issue_note : dbRound?.animal_issue_note,
          status: 'COMPLETED',
          completed_by: user.id,
          created_by: isEdit ? dbRound!.created_by : user.id,
          modified_by: isEdit ? user.id : null,
          is_deleted: false,
        };
      });

      await dailyRoundsService.bulkUpsertRounds(roundsToSubmit);

      setDraftRounds({});
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['rounds', activeDate, activeShift] });
      toast.success('Rounds checklist successfully synced');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save rounds';
      console.error('[DailyRounds] Submit error:', error);
      toast.error(`Rounds Save Failed: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div className="shrink-0 pr-4">
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight">Daily Rounds</h1>
        </div>
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search collections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 sm:ml-auto w-full sm:w-auto shrink-0">
          {activeDate !== getLocalDateString() && (
            <button
              type="button"
              onClick={jumpToToday}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors shadow-xs border border-emerald-200 cursor-pointer"
            >
              <Calendar size={13} /> Today
            </button>
          )}

          <div className="flex items-center justify-between bg-white rounded-lg p-0.5 border border-slate-200 shadow-xs w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="p-1 hover:bg-slate-50 rounded text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex-1 sm:flex-none relative flex justify-center border-l border-r border-slate-100 px-2 min-w-[110px]">
              <input
                type="date"
                value={inputDate}
                onChange={(e) => setInputDate(e.target.value)}
                onBlur={(e) => handleDateChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDateChange(e.currentTarget.value)}
                className="bg-transparent border-none text-[10px] lg:text-xs font-bold text-slate-700 focus:outline-none focus:ring-0 py-0.5 cursor-pointer w-full text-center"
              />
            </div>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="p-1 hover:bg-slate-50 rounded text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="flex bg-slate-200/60 p-0.5 rounded-lg w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveShift('MORNING')}
              className={`flex-1 sm:flex-none px-3 py-1 rounded-md text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                activeShift === 'MORNING'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              AM Shift
            </button>
            <button
              type="button"
              onClick={() => setActiveShift('AFTERNOON')}
              className={`flex-1 sm:flex-none px-3 py-1 rounded-md text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                activeShift === 'AFTERNOON'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              PM Shift
            </button>
          </div>
        </div>
      </div>

      {/* Category Tabs Ordered: Owl, Raptor, Mammal, Exotics */}
      <div className="grid grid-cols-4 lg:flex lg:gap-1.5 w-full shrink-0 gap-1">
        {CATEGORY_TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-1.5 lg:px-4 py-1.5 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Virtualized Data List Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100">
              <Loader2 className="animate-spin text-emerald-500" size={20} />
              <span className="text-xs font-bold text-slate-700">Syncing rounds checklist...</span>
            </div>
          </div>
        )}

        <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50/30">
          {displayAnimals.length === 0 && !isLoading ? (
            <div className="p-8 lg:p-12 text-center text-slate-500 flex flex-col items-center">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-3 border border-slate-200 shadow-xs">
                <Search size={20} className="text-slate-400" />
              </div>
              <p className="font-black text-slate-700 mb-0.5 text-xs tracking-tight">No specimens found</p>
              <p className="text-[10px] font-medium text-slate-400">Try adjusting your search or category filters.</p>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const animal = displayAnimals[virtualItem.index]!;
                const dbRound = roundsMap.get(animal.id);
                const draft = draftRounds[animal.id];
                const mergedRound = draft ? { ...dbRound, ...draft } : dbRound;

                const isGroup = animal.record_type === 'GROUP';
                const isAlive = mergedRound?.is_alive !== undefined ? mergedRound.is_alive : true;
                const waterChecked =
                  mergedRound?.water_checked !== undefined ? mergedRound.water_checked : false;
                const locksSecured =
                  mergedRound?.locks_secured !== undefined ? mergedRound.locks_secured : false;
                const hasNote = Boolean(mergedRound?.animal_issue_note);

                return (
                  <div
                    key={animal.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full border-b border-slate-100 hover:bg-slate-50/80 transition-colors box-border bg-white"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <div className="w-full px-3 py-2 lg:px-4 lg:py-2.5 flex flex-col lg:flex-row gap-2.5 lg:gap-4 lg:items-center">
                      {/* Identity Block */}
                      <div className="flex items-center gap-2.5 min-w-0 w-full lg:w-[36%] py-0.5 shrink-0">
                        <div
                          className={`w-8 h-8 lg:w-9 lg:h-9 rounded-full flex items-center justify-center shrink-0 border shadow-xs overflow-hidden ${
                            !animal.profile_image_url
                              ? isGroup
                                ? 'bg-blue-50 text-blue-600 border-blue-100'
                                : 'bg-slate-50 text-slate-400 border border-slate-200'
                              : 'border-slate-200'
                          }`}
                        >
                          {animal.profile_image_url ? (
                            <img
                              src={animal.profile_image_url}
                              alt={animal.name}
                              className="w-full h-full object-cover"
                            />
                          ) : isGroup ? (
                            <Users size={15} />
                          ) : (
                            <User size={15} />
                          )}
                        </div>

                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3
                              className="font-bold text-slate-900 text-xs lg:text-[13px] tracking-tight truncate"
                              title={animal.name}
                            >
                              {animal.name}
                            </h3>
                            {hasNote && <AlertCircle size={13} className="text-amber-500 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-400 truncate mt-0.5 font-bold">
                            {animal.ring_number && (
                              <span className="uppercase tracking-widest">{animal.ring_number}</span>
                            )}
                            {animal.ring_number && animal.species && <span>•</span>}
                            {animal.species && (
                              <span className="italic truncate" title={animal.species}>
                                {animal.species}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons Block */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-row flex-1 gap-2 lg:gap-2.5 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggle(animal.id, 'is_alive')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border shadow-xs transition-all lg:w-[125px] cursor-pointer active:scale-95 ${
                            isAlive
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          {isAlive ? (
                            <HeartPulse size={13} className="shrink-0 text-emerald-600" />
                          ) : (
                            <AlertCircle size={13} className="shrink-0 text-rose-600" />
                          )}
                          <span className="text-[10px] font-black uppercase tracking-widest truncate">
                            {isAlive ? 'Visual: OK' : 'Visual: ISSUE'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggle(animal.id, 'water_checked')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border shadow-xs transition-all lg:w-[125px] cursor-pointer active:scale-95 ${
                            waterChecked
                              ? 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Droplets
                            size={13}
                            className={`shrink-0 ${waterChecked ? 'text-sky-600' : 'text-slate-400'}`}
                          />
                          <span className="text-[10px] font-black uppercase tracking-widest truncate">
                            {waterChecked ? 'Water: OK' : 'Check Water'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggle(animal.id, 'locks_secured')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border shadow-xs transition-all lg:w-[125px] cursor-pointer active:scale-95 ${
                            locksSecured
                              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Lock
                            size={13}
                            className={`shrink-0 ${locksSecured ? 'text-amber-600' : 'text-slate-400'}`}
                          />
                          <span className="text-[10px] font-black uppercase tracking-widest truncate">
                            {locksSecured ? 'Locks: OK' : 'Check Locks'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setNoteModalState({
                              isOpen: true,
                              animal,
                              round: mergedRound as DailyRound,
                              currentNote: mergedRound?.animal_issue_note || '',
                            })
                          }
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border shadow-xs transition-all lg:w-[120px] cursor-pointer active:scale-95 ${
                            hasNote
                              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {hasNote ? (
                            <AlertCircle size={13} className="shrink-0 text-amber-600" />
                          ) : (
                            <Edit3 size={13} className="shrink-0 text-slate-400" />
                          )}
                          <span className="text-[10px] font-black uppercase tracking-widest truncate">
                            {hasNote ? 'Note Logged' : 'Add Note'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Submission Bar */}
        <div className="border-t border-slate-200 bg-white/95 backdrop-blur p-2.5 sm:p-3 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex-1 min-w-0 pr-4">
            {hasUnsavedChanges ? (
              <div className="flex items-center gap-1.5 text-amber-600">
                <AlertCircle size={15} className="shrink-0" />
                <span className="text-[11px] font-bold truncate">Unsaved check modifications detected</span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium truncate block">
                All checks verified &amp; synchronized.
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasUnsavedChanges || isSubmitting}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs cursor-pointer ${
              hasUnsavedChanges && !isSubmitting
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Submit Rounds
          </button>
        </div>
      </div>

      {/* Rounds Note Modal */}
      {noteModalState.isOpen && noteModalState.animal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200/80 flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/60">
              <div>
                <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase tracking-tight">
                  {noteModalState.animal.name}
                </h3>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-black mt-0.5">
                  Welfare &amp; Security Observation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' })}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <textarea
                value={noteModalState.currentNote}
                onChange={(e) => setNoteModalState((prev) => ({ ...prev, currentNote: e.target.value }))}
                placeholder="Enter details regarding lock issues, water bowl replenishment, lethargy, or enclosure wear..."
                className="w-full h-32 border border-slate-200 rounded-2xl p-3 text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-none shadow-xs"
              />
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex gap-2">
              <button
                type="button"
                onClick={() => setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' })}
                className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors shadow-xs active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const animalId = noteModalState.animal!.id;
                  const trimmed = noteModalState.currentNote.trim();

                  setDraftRounds((prev) => {
                    const existingDraft = prev[animalId];
                    const dbRound = roundsMap.get(animalId);
                    const merged = existingDraft ? { ...dbRound, ...existingDraft } : dbRound;

                    return {
                      ...prev,
                      [animalId]: {
                        ...prev[animalId],
                        animal_id: animalId,
                        is_alive: merged?.is_alive !== undefined ? merged.is_alive : true,
                        water_checked: merged?.water_checked !== undefined ? merged.water_checked : false,
                        locks_secured: merged?.locks_secured !== undefined ? merged.locks_secured : false,
                        animal_issue_note: trimmed,
                      },
                    };
                  });
                  setHasUnsavedChanges(true);
                  setNoteModalState({ isOpen: false, animal: null, round: null, currentNote: '' });
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Save size={14} /> Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DailyRounds;