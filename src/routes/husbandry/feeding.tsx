import { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Plus,
  Trash2,
  Loader2,
  Utensils,
  Calendar as CalIcon,
  Filter,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { Animal, FeedingSchedule as FeedingScheduleType } from '../../types';
import { feedingService } from '../../services/feedingService';
import { FeedingScheduleModal } from '../../components/husbandry/FeedingScheduleModal';

const CATEGORY_TABS = [
  { id: 'OWL', label: 'Owl' },
  { id: 'RAPTOR', label: 'Raptor' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotics' },
] as const;

interface GroupedScheduleItem extends FeedingScheduleType {
  count: number;
  start_date: string;
  end_date: string;
  child_ids: string[];
  feed_not_required: boolean;
}

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('T')[0]!.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatShortDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('T')[0]!.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
};

const getAnimalsOptions = () =>
  queryOptions({
    queryKey: ['animals', 'husbandry'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('*')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return (data || []) as Animal[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

const getSchedulesOptions = () =>
  queryOptions({
    queryKey: ['feeding_schedules'],
    queryFn: async () => {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 360);
      const maxDateStr = getLocalDateString(maxDate);

      const { data, error } = await supabase
        .from('feeding_schedules')
        .select('*')
        .eq('is_deleted', false)
        .lte('scheduled_date', maxDateStr)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return (data || []) as FeedingScheduleType[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

export const Route = createFileRoute('/husbandry/feeding')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(getAnimalsOptions()),
      context.queryClient.ensureQueryData(getSchedulesOptions()),
    ]);
  },
  component: FeedingSchedulePage,
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

export function FeedingSchedulePage() {
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<string>('OWL');
  const [filterAnimalId, setFilterAnimalId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewLayout, setViewLayout] = useState<'individual' | 'grouped'>('individual');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const channel = supabase
      .channel('feeding-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feeding_schedules' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(getAnimalsOptions());
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery(getSchedulesOptions());

  const deleteSingleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      if (!user?.id) throw new Error('Unauthorized');
      await feedingService.deleteSchedule(scheduleId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
      toast.success('Feeding schedule deleted');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      toast.error(msg);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (scheduleIds: string[]) => {
      if (!user?.id) throw new Error('Unauthorized');
      await Promise.all(scheduleIds.map((id) => feedingService.deleteSchedule(id, user.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
      toast.success('Batch schedules deleted');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Group deletion failed';
      toast.error(msg);
    },
  });

  const upcomingSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
  }, [schedules]);

  const displayedSchedules = useMemo(() => {
    let filtered = upcomingSchedules.filter((s) => {
      const animal = animals.find((a) => a.id === s.animal_id);
      const cat = (animal?.category || '').toUpperCase();
      if (activeTab === 'EXOTIC') {
        return cat === 'EXOTIC' || cat === 'EXOTICS';
      }
      return cat === activeTab;
    });

    if (filterAnimalId !== 'ALL') {
      filtered = filtered.filter((s) => s.animal_id === filterAnimalId);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => {
        const animal = animals.find((a) => a.id === s.animal_id);
        const matchName = animal?.name?.toLowerCase().includes(q);
        const matchSpecies = animal?.species?.toLowerCase().includes(q);
        const matchFood = s.food_type?.toLowerCase().includes(q);
        return matchName || matchSpecies || matchFood;
      });
    }
    return filtered;
  }, [upcomingSchedules, filterAnimalId, searchQuery, animals, activeTab]);

  const groupedSchedules = useMemo<GroupedScheduleItem[]>(() => {
    const groups = new Map<string, GroupedScheduleItem>();

    displayedSchedules.forEach((schedule) => {
      const isNotRequired = schedule.notes === 'FAST DAY / NOT REQUIRED';
      const supplementKey = schedule.supplements || 'none';
      const key = `${schedule.animal_id}_${schedule.food_type}_${schedule.quantity}_${supplementKey}_${isNotRequired}`;

      if (!groups.has(key)) {
        groups.set(key, {
          ...schedule,
          count: 1,
          end_date: schedule.scheduled_date,
          start_date: schedule.scheduled_date,
          child_ids: [schedule.id],
          feed_not_required: isNotRequired,
        });
      } else {
        const existing = groups.get(key)!;
        existing.count += 1;
        if (schedule.scheduled_date > existing.end_date) existing.end_date = schedule.scheduled_date;
        if (schedule.scheduled_date < existing.start_date) existing.start_date = schedule.scheduled_date;
        existing.child_ids.push(schedule.id);
      }
    });

    return Array.from(groups.values());
  }, [displayedSchedules]);

  const activeList = viewLayout === 'individual' ? displayedSchedules : groupedSchedules;

  const rowVirtualizer = useVirtualizer({
    count: activeList.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => (isMobile ? 120 : 64),
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const tableGridCols =
    'minmax(140px, 1.2fr) minmax(180px, 1.5fr) minmax(250px, 2fr) minmax(80px, 0.5fr)';

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight">
            Feeding Schedules
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            Dietary prep &amp; distribution board
          </p>
        </div>

        {hasPermission('husbandry:write') && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Plus size={14} className="text-emerald-400" />
            <span>Add Schedule</span>
          </button>
        )}
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search specimen, diet item, or species..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs flex-1 sm:flex-none">
            <Filter size={13} className="text-slate-400 shrink-0" />
            <select
              value={filterAnimalId}
              onChange={(e) => setFilterAnimalId(e.target.value)}
              className="bg-transparent text-[10px] lg:text-xs font-bold text-slate-700 uppercase tracking-wider border-none focus:ring-0 cursor-pointer outline-none py-0.5 pr-2 w-full sm:w-44 truncate"
            >
              <option value="ALL">All Specimens</option>
              {animals
                .filter((a) => {
                  const cat = (a.category || '').toUpperCase();
                  if (activeTab === 'EXOTIC') return cat === 'EXOTIC' || cat === 'EXOTICS';
                  return cat === activeTab;
                })
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.species || 'Unknown'})
                  </option>
                ))}
            </select>
          </div>

          <div className="bg-slate-200/60 p-0.5 rounded-lg flex shrink-0">
            <button
              type="button"
              onClick={() => setViewLayout('individual')}
              className={`px-3 py-1 rounded-md text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                viewLayout === 'individual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('grouped')}
              className={`px-3 py-1 rounded-md text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                viewLayout === 'grouped'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Grouped
            </button>
          </div>
        </div>
      </div>

      {/* Category Tabs: Owl, Raptor, Mammal, Exotics */}
      <div className="grid grid-cols-4 lg:flex lg:gap-1.5 w-full shrink-0 gap-1">
        {CATEGORY_TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setFilterAnimalId('ALL');
            }}
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

      {/* Main Data View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 relative overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex justify-between items-center shrink-0">
          <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
            <Utensils size={13} className="text-emerald-600" />
            Active Kitchen Diets ({activeList.length})
          </h4>
        </div>

        <div
          ref={scrollParentRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar bg-slate-50/30"
        >
          {loadingSchedules && (
            <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-xs flex items-center justify-center">
              <div className="flex flex-col items-center gap-2.5 bg-white p-3.5 rounded-xl shadow-lg border border-slate-100">
                <Loader2 className="animate-spin text-emerald-600 w-7 h-7" />
                <span className="text-xs font-bold text-slate-600">Syncing kitchen schedules...</span>
              </div>
            </div>
          )}

          <div className="min-w-[300px] lg:min-w-[800px] w-full">
            {/* Desktop Grid Header */}
            <div
              className="hidden lg:grid border-b border-slate-200 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-20 backdrop-blur-md"
              style={{ gridTemplateColumns: tableGridCols }}
            >
              <div className="px-4 py-2.5 flex items-center justify-start text-left">Date / Window</div>
              <div className="px-4 py-2.5 flex items-center justify-start text-left">Specimen</div>
              <div className="px-4 py-2.5 flex items-center justify-start text-left">Diet Specifics &amp; Ration</div>
              <div className="px-4 py-2.5 flex items-center justify-end text-right">Action</div>
            </div>

            {/* List Body */}
            <div className="bg-white">
              {!loadingSchedules && activeList.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-center">
                  <Utensils size={28} className="text-slate-300 mb-2" />
                  <p className="text-xs font-black text-slate-600 uppercase tracking-tight">
                    No active feeding schedules found
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Click 'Add Schedule' above to generate routine diet rations.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualItems.map((virtualRow) => {
                    const item = activeList[virtualRow.index]!;

                    if (viewLayout === 'individual') {
                      const schedule = item as FeedingScheduleType;
                      const animal = animals.find((a) => a.id === schedule.animal_id);
                      const isToday = schedule.scheduled_date === getLocalDateString();
                      const isNotRequired = schedule.notes === 'FAST DAY / NOT REQUIRED';

                      return (
                        <div
                          key={schedule.id}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="absolute top-0 left-0 w-full grid grid-cols-1 lg:grid border-b border-slate-100 hover:bg-slate-50/80 transition-colors group p-2.5 lg:p-0 bg-white"
                          style={{
                            gridTemplateColumns: isMobile ? '1fr' : tableGridCols,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          {/* Date */}
                          <div
                            className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                              isMobile ? 'flex-col mb-1.5' : 'items-center justify-start'
                            }`}
                          >
                            {isMobile && (
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Date
                              </div>
                            )}
                            <div
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest w-fit ${
                                isToday
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-xs'
                                  : 'bg-slate-100 border-slate-200 text-slate-600'
                              }`}
                            >
                              <CalIcon size={11} /> {formatDisplayDate(schedule.scheduled_date)}
                            </div>
                          </div>

                          {/* Animal */}
                          <div
                            className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                              isMobile ? 'flex-col mb-1.5' : 'items-center justify-start'
                            }`}
                          >
                            {isMobile && (
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Specimen
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 uppercase tracking-tight truncate">
                                {animal?.name || 'Unknown Specimen'}
                              </p>
                              <span className="text-[10px] text-slate-400 font-bold block truncate">
                                {animal?.species || 'Unclassified'}
                              </span>
                            </div>
                          </div>

                          {/* Diet */}
                          <div
                            className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                              isMobile ? 'flex-col mb-2' : 'items-center justify-start'
                            }`}
                          >
                            {isMobile && (
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Diet Specifics
                              </div>
                            )}
                            <div className="w-full">
                              {isNotRequired ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-md bg-rose-50 border border-rose-100 text-[10px] font-black text-rose-600 uppercase tracking-widest">
                                  FAST DAY • NOT REQUIRED
                                </span>
                              ) : (
                                <div>
                                  <p className="text-[11px] lg:text-xs font-black text-emerald-700 uppercase tracking-widest">
                                    {schedule.quantity}x {schedule.food_type}
                                  </p>
                                  {schedule.supplements && (
                                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[9px] bg-amber-50 border border-amber-200 text-amber-800 font-bold uppercase tracking-widest">
                                      + {schedule.supplements}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action */}
                          <div
                            className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                              isMobile ? 'justify-end' : 'items-center justify-end'
                            }`}
                          >
                            {hasPermission('husbandry:delete') && (
                              <button
                                type="button"
                                onClick={() => deleteSingleMutation.mutate(schedule.id)}
                                disabled={deleteSingleMutation.isPending}
                                className={`p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-50 ${
                                  isMobile ? '' : 'opacity-0 group-hover:opacity-100'
                                }`}
                                title="Delete Schedule"
                              >
                                {deleteSingleMutation.isPending ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const group = item as GroupedScheduleItem;
                    const animal = animals.find((a) => a.id === group.animal_id);

                    return (
                      <div
                        key={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className="absolute top-0 left-0 w-full grid grid-cols-1 lg:grid border-b border-slate-100 hover:bg-slate-50/80 transition-colors group p-2.5 lg:p-0 bg-white"
                        style={{
                          gridTemplateColumns: isMobile ? '1fr' : tableGridCols,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {/* Date Window */}
                        <div
                          className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                            isMobile ? 'flex-col mb-1.5' : 'items-center justify-start'
                          }`}
                        >
                          {isMobile && (
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                              Date Window
                            </div>
                          )}
                          <div className="flex flex-col gap-1 w-fit">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-black uppercase tracking-widest">
                              From: {formatShortDate(group.start_date)}
                            </span>
                            {group.count > 1 && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-black uppercase tracking-widest">
                                Until: {formatShortDate(group.end_date)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Animal */}
                        <div
                          className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                            isMobile ? 'flex-col mb-1.5' : 'items-center justify-start'
                          }`}
                        >
                          {isMobile && (
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                              Specimen
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 uppercase tracking-tight truncate">
                              {animal?.name || 'Unknown Specimen'}
                            </p>
                            <span className="text-[10px] text-slate-400 font-bold block truncate">
                              {animal?.species || 'Unclassified'}
                            </span>
                          </div>
                        </div>

                        {/* Diet */}
                        <div
                          className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                            isMobile ? 'flex-col mb-2' : 'items-center justify-start'
                          }`}
                        >
                          {isMobile && (
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                              Diet Specifics
                            </div>
                          )}
                          <div className="w-full">
                            {group.feed_not_required ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-md bg-rose-50 border border-rose-100 text-[10px] font-black text-rose-600 uppercase tracking-widest">
                                FAST DAY • NOT REQUIRED ({group.count} days)
                              </span>
                            ) : (
                              <div>
                                <p className="text-[11px] lg:text-xs font-black text-emerald-700 uppercase tracking-widest">
                                  {group.quantity}x {group.food_type}{' '}
                                  <span className="text-slate-400 font-bold text-[10px]">
                                    ({group.count} feeds)
                                  </span>
                                </p>
                                {group.supplements && (
                                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[9px] bg-amber-50 border border-amber-200 text-amber-800 font-bold uppercase tracking-widest">
                                    + {group.supplements}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action */}
                        <div
                          className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                            isMobile ? 'justify-end' : 'items-center justify-end'
                          }`}
                        >
                          {hasPermission('husbandry:delete') && (
                            <button
                              type="button"
                              onClick={() => deleteGroupMutation.mutate(group.child_ids)}
                              disabled={deleteGroupMutation.isPending}
                              className={`p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-50 ${
                                isMobile ? '' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              title="Delete entire cadence series"
                            >
                              {deleteGroupMutation.isPending ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Standalone Schedule Modal Component */}
      <FeedingScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        activeCategory={activeTab}
      />
    </div>
  );
}

export default FeedingSchedulePage;