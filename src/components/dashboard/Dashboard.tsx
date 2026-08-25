import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useTable,
  tableFeatures,
  createColumnHelper,
  flexRender,
  type SortingState,
  type ExpandedState,
  type VisibilityState,
  rowSortingFeature,
  columnFilteringFeature,
  rowExpandingFeature,
  columnVisibilityFeature,
} from '@tanstack/react-table';
import {
  Search,
  Plus,
  ArrowUpDown,
  Loader2,
  Scale,
  ChevronRight,
  ChevronDown,
  Users,
  User,
  MapPin,
  ChevronLeft,
} from 'lucide-react';
import type { Animal, FeedLog, WeightLog, TemperatureLog, FeedingSchedule } from '../../types';
import { supabase } from '../../lib/supabase';
import AnimalFormModal from '../animals/AnimalFormModal';
import { AnimalProfile } from '../animals/AnimalProfile';
import { MobProfile } from '../animals/MobProfile';
import { scheduledFeedingService, type FeedingScheduleWithAnimal } from '../../services/scheduledFeedingService';
import { FeedModal } from '../husbandry/FeedModal';

interface DashboardAnimalRow extends Animal {
  today_weight?: WeightLog | null;
  today_feed?: FeedLog[];
  last_feed?: FeedLog | null;
  today_temp?: TemperatureLog | null;
  next_feed?: FeedingScheduleWithAnimal | null;
  subRows?: DashboardAnimalRow[];
}

const EMPTY_ARRAY: never[] = [];
const GRAMS_PER_OZ = 28.349523125;

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  rowExpandingFeature,
  columnVisibilityFeature,
});

function useScreenSize() {
  const [screen, setScreen] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    isMobile: typeof window !== 'undefined' && window.innerWidth < 768,
    isTablet: typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024,
    isDesktop: typeof window !== 'undefined' && window.innerWidth >= 1024,
  });

  useEffect(() => {
    const handleResize = () => {
      setScreen({
        width: window.innerWidth,
        isMobile: window.innerWidth < 768,
        isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
        isDesktop: window.innerWidth >= 1024,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return screen;
}

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatWeightDisplay = (
  grams: number | null | undefined,
  unit: string | null | undefined
): string | null => {
  if (grams === null || grams === undefined) return null;
  const numGrams = Number(grams);
  if (Number.isNaN(numGrams)) return null;

  const safeUnit = String(unit || 'g').toLowerCase().trim();

  if (safeUnit === 'kg' || safeUnit === 'kilogram' || safeUnit === 'kilograms') {
    return `${(numGrams / 1000).toFixed(3)}kg`;
  }

  if (safeUnit === 'lb' || safeUnit === 'lbs' || safeUnit === 'pound' || safeUnit === 'pounds') {
    const totalOunces = numGrams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let eighths = Math.round((totalOunces - totalOzInt) * 8);
    if (eighths >= 8) {
      totalOzInt += 1;
      eighths = 0;
    }
    const lb = Math.floor(totalOzInt / 16);
    const oz = totalOzInt % 16;
    let str = '';
    if (lb > 0) str += `${lb}lb `;
    if (oz > 0 || eighths > 0) str += `${oz}`;
    if (eighths > 0 && eighths !== 8) str += ` ${eighths}/8`;
    if (oz > 0 || eighths > 0) str += 'oz';
    return str.trim() || '0lb';
  }

  if (safeUnit === 'oz' || safeUnit === 'ounce' || safeUnit === 'ounces') {
    const totalOunces = numGrams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let eighths = Math.round((totalOunces - totalOzInt) * 8);
    if (eighths >= 8) {
      totalOzInt += 1;
      eighths = 0;
    }
    let str = `${totalOzInt}`;
    if (eighths > 0 && eighths !== 8) str += ` ${eighths}/8`;
    return `${str}oz`;
  }

  return `${Math.round(numGrams)}g`;
};

const formatQty = (qty: number | null | undefined, unit: string | null | undefined): string => {
  if (qty === null || qty === undefined || String(qty).trim() === '') return '';
  const safeUnit = String(unit || '').toLowerCase().trim();
  if (safeUnit.includes('item') || safeUnit.includes('whole') || safeUnit === 'x' || safeUnit === '') {
    return `${qty}x `;
  }
  if (safeUnit === 'grams' || safeUnit === 'g') {
    return `${qty}g `;
  }
  return `${qty}${unit} `;
};

const columnHelper = createColumnHelper<DashboardAnimalRow>();

export default function Dashboard() {
  const queryClient = useQueryClient();
  const screen = useScreenSize();

  const [activeTab, setActiveTab] = useState<string>('EXOTIC');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const [isCreateAnimalModalOpen, setIsCreateAnimalModalOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);

  const [feedActionAnimalId, setFeedActionAnimalId] = useState<string | null>(null);
  const [isFeedModalOpen, setIsFeedModalOpen] = useState(false);
  const [feedModalSchedule, setFeedModalSchedule] = useState<FeedingSchedule | null>(null);

  const [activeDate, setActiveDate] = useState<string>(getLocalDateString());
  const [inputDate, setInputDate] = useState<string>(getLocalDateString());

  const { data: allAnimals = EMPTY_ARRAY, isLoading: loadingAnimals } = useQuery<Animal[]>({
    queryKey: ['animals', 'dashboard'],
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

  const { data: todayFeeds = EMPTY_ARRAY, isLoading: loadingFeeds } = useQuery<FeedLog[]>({
    queryKey: ['feeds', activeDate],
    queryFn: async () => {
      const start = new Date(`${activeDate}T00:00:00.000Z`).toISOString();
      const end = new Date(`${activeDate}T23:59:59.999Z`).toISOString();
      const { data, error } = await supabase
        .from('feed_logs')
        .select('*')
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as FeedLog[];
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  const { data: todayWeights = EMPTY_ARRAY, isLoading: loadingWeights } = useQuery<WeightLog[]>({
    queryKey: ['weights', activeDate],
    queryFn: async () => {
      const start = new Date(`${activeDate}T00:00:00.000Z`).toISOString();
      const end = new Date(`${activeDate}T23:59:59.999Z`).toISOString();
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as WeightLog[];
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  const { data: todayTemps = EMPTY_ARRAY, isLoading: loadingTemps } = useQuery<TemperatureLog[]>({
    queryKey: ['temperatures', activeDate],
    queryFn: async () => {
      const start = new Date(`${activeDate}T00:00:00.000Z`).toISOString();
      const end = new Date(`${activeDate}T23:59:59.999Z`).toISOString();
      const { data, error } = await supabase
        .from('temperature_logs')
        .select('*')
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as TemperatureLog[];
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  const { data: historicalFeeds = EMPTY_ARRAY } = useQuery<FeedLog[]>({
    queryKey: ['feeds_historical_latest'],
    queryFn: async () => {
      const { data, error } = await supabase.from('latest_animal_feeds').select('*');
      if (error) {
        const { data: fallbackLogs, error: fallbackErr } = await supabase
          .from('feed_logs')
          .select('*')
          .eq('is_deleted', false)
          .order('recorded_at', { ascending: false })
          .limit(100);
        if (fallbackErr) throw fallbackErr;
        return (fallbackLogs || []) as FeedLog[];
      }
      return (data || []) as FeedLog[];
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  const { data: nextFeeds = EMPTY_ARRAY } = useQuery<FeedingScheduleWithAnimal[]>({
    queryKey: ['dashboard', 'next_feeds', activeTab],
    queryFn: () => scheduledFeedingService.getNextPendingFeeds(activeTab),
    enabled: activeTab === 'EXOTIC',
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
    refetchOnWindowFocus: true,
  });

  const loadingLogs = loadingFeeds || loadingWeights || loadingTemps;

  const selectedAnimal = useMemo(() => {
    return selectedAnimalId ? allAnimals.find((a) => a.id === selectedAnimalId) || null : null;
  }, [allAnimals, selectedAnimalId]);

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'animals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['animals'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['feeds'] });
        queryClient.invalidateQueries({ queryKey: ['feeds_historical_latest'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'next_feeds'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['weights'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temperature_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['temperatures'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feeding_schedules' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'next_feeds'] });
        queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateDate = useCallback((newDate: string) => {
    setActiveDate(newDate);
    setInputDate(newDate);
  }, []);

  const shiftDate = useCallback(
    (days: number) => {
      const parts = activeDate.split('-');
      if (parts.length !== 3) return;
      const [y, m, d] = parts.map(Number);
      const dateObj = new Date(y, m - 1, d);
      dateObj.setDate(dateObj.getDate() + days);
      updateDate(getLocalDateString(dateObj));
    },
    [activeDate, updateDate]
  );

  const hierarchicalData = useMemo<DashboardAnimalRow[]>(() => {
    const weightMap = new Map<string, WeightLog>();
    todayWeights.forEach((w) => {
      if (!weightMap.has(w.animal_id)) weightMap.set(w.animal_id, w);
    });

    const tempMap = new Map<string, TemperatureLog>();
    todayTemps.forEach((t) => {
      if (!tempMap.has(t.animal_id)) tempMap.set(t.animal_id, t);
    });

    const feedMap = new Map<string, FeedLog[]>();
    todayFeeds.forEach((f) => {
      if (!feedMap.has(f.animal_id)) feedMap.set(f.animal_id, []);
      feedMap.get(f.animal_id)!.push(f);
    });

    const lastFeedMap = new Map<string, FeedLog>();
    historicalFeeds.forEach((f) => {
      if (!lastFeedMap.has(f.animal_id)) lastFeedMap.set(f.animal_id, f);
    });

    const nextFeedMap = new Map<string, FeedingScheduleWithAnimal>();
    nextFeeds.forEach((f) => {
      if (!nextFeedMap.has(f.animal_id)) nextFeedMap.set(f.animal_id, f);
    });

    let baseData: DashboardAnimalRow[] = allAnimals.map((a) => ({
      ...a,
      today_weight: weightMap.get(a.id) || null,
      today_temp: tempMap.get(a.id) || null,
      today_feed: feedMap.get(a.id) || [],
      last_feed: lastFeedMap.get(a.id) || null,
      next_feed: nextFeedMap.get(a.id) || null,
    }));

    if (activeTab === 'ARCHIVED') {
      baseData = baseData.filter((a) => a.status === 'ARCHIVED');
    } else {
      baseData = baseData.filter((a) => a.category === activeTab && a.status !== 'ARCHIVED');
    }

    const groups = baseData.filter((a) => a.record_type === 'GROUP');
    const individuals = baseData.filter((a) => a.record_type === 'INDIVIDUAL');

    groups.forEach((group) => {
      group.subRows = individuals.filter((indiv) => indiv.parent_group_id === group.id);
    });

    const standaloneIndividuals = individuals.filter((indiv) => !indiv.parent_group_id);
    return [...groups, ...standaloneIndividuals];
  }, [allAnimals, todayWeights, todayTemps, todayFeeds, historicalFeeds, nextFeeds, activeTab]);

  const columns = useMemo(() => {
    const cols = [
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Name',
        cell: (info) => {
          const animal = info.row.original;
          const isGroup = animal.record_type === 'GROUP';
          const isIndivWithGroup = animal.record_type === 'INDIVIDUAL' && Boolean(animal.parent_group_id);
          const photoUrl = animal.profile_image_url;

          return (
            <div className="flex items-center gap-1.5 lg:gap-3 py-0.5 w-full">
              <div className={`relative hidden lg:block ${isIndivWithGroup ? 'ml-6' : ''}`}>
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    className="w-8 h-8 lg:w-9 lg:h-9 rounded-full object-cover shrink-0 shadow-xs border border-slate-200"
                    alt=""
                  />
                ) : (
                  <div
                    className={`p-1.5 lg:p-2 rounded-full shrink-0 shadow-xs ${
                      isGroup
                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                        : 'bg-slate-50 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isGroup ? <Users size={13} className="lg:w-3.5 lg:h-3.5" /> : <User size={13} className="lg:w-3.5 lg:h-3.5" />}
                  </div>
                )}
                {isGroup && (
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                    <Users size={7} className="text-white" />
                  </div>
                )}
              </div>

              <div className={`flex flex-col min-w-0 flex-1 ${isIndivWithGroup ? 'ml-2 lg:ml-0' : ''}`}>
                <div className="flex items-center gap-1">
                  {isGroup && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        info.row.toggleExpanded();
                      }}
                      className="p-1 hover:bg-slate-200 rounded-md text-slate-500 shrink-0 transition-colors cursor-pointer"
                    >
                      {info.row.getIsExpanded() ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  )}
                  <span
                    className="font-bold text-slate-900 text-[11px] md:text-xs lg:text-[13px] truncate w-full hover:underline cursor-pointer"
                    title={animal.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnimalId(animal.id);
                    }}
                  >
                    {animal.name}
                  </span>
                </div>
                {animal.ring_number && (
                  <span className="text-[8px] lg:text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                    <div className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-slate-300 hidden lg:block" />
                    {animal.ring_number}
                  </span>
                )}
              </div>
            </div>
          );
        },
      }),
    ];

    if (!screen.isMobile) {
      cols.push(
        columnHelper.accessor('species', {
          id: 'species',
          header: 'Species',
          cell: (info) => (
            <div className="flex flex-col justify-center min-w-0 py-0.5">
              <span
                className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-700 leading-tight truncate"
                title={info.getValue() || 'Unknown'}
              >
                {info.getValue() || 'Unknown'}
              </span>
            </div>
          ),
        })
      );
    }

    cols.push(
      columnHelper.accessor('location', {
        id: 'location',
        header: 'Location',
        cell: (info) => (
          <div className="flex items-center justify-center gap-1 lg:gap-1.5 py-0.5 min-w-0 w-full">
            <MapPin size={10} className="text-slate-400 shrink-0 hidden lg:block" />
            <span className="text-[9px] md:text-[10px] lg:text-[11px] font-bold text-slate-600 uppercase tracking-widest leading-tight text-center">
              {info.getValue() || 'Unassigned'}
            </span>
          </div>
        ),
      }),

      columnHelper.accessor('today_weight', {
        id: 'today_weight',
        header: 'Weight',
        cell: (info) => {
          const w = info.getValue();
          const animal = info.row.original;

          if (!w) {
            return (
              <span className="text-slate-300 text-[10px] md:text-[11px] lg:text-xs font-medium py-0.5 block w-full text-center">
                -
              </span>
            );
          }

          const preferredUnit = animal.preferred_weight_unit || animal.weight_unit || 'g';

          return (
            <div className="flex items-center justify-center gap-1 lg:gap-1.5 py-0.5 w-full">
              <Scale size={10} className="text-emerald-500 shrink-0 hidden lg:block" />
              <span className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-700">
                {formatWeightDisplay(w.weight_grams, preferredUnit)}
              </span>
            </div>
          );
        },
      }),

      columnHelper.accessor('today_feed', {
        id: 'today_feed',
        header: "Today's Feed",
        cell: (info) => {
          const feeds = info.getValue() || [];
          if (feeds.length === 0) {
            return (
              <span className="text-slate-300 text-[10px] lg:text-xs font-medium py-0.5 block w-full text-center">
                -
              </span>
            );
          }

          return (
            <div className="flex flex-col gap-0.5 w-full text-center">
              {feeds.map((f, i) => {
                const qty = f.quantity_offered ?? f.quantity;
                const unit = f.quantity_unit ?? f.unit;
                const qtyUnit = formatQty(qty, unit);
                const timeStr = new Date(f.recorded_at).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const displayString = `${qtyUnit}${f.food_item || f.food_type || 'Diet'} @ ${timeStr}`;

                return (
                  <span
                    key={f.id || i}
                    className="text-[9px] md:text-[10px] lg:text-[11px] font-bold text-slate-700 break-words whitespace-normal w-full block"
                    title={displayString}
                  >
                    {displayString}
                  </span>
                );
              })}
            </div>
          );
        },
      }),

      columnHelper.accessor('last_feed', {
        id: 'last_feed',
        header: 'Last Feed',
        cell: (info) => {
          const lastMeal = info.getValue();
          if (!lastMeal) {
            return (
              <span className="text-slate-300 text-[10px] lg:text-xs font-medium py-0.5 block w-full text-center">
                No History
              </span>
            );
          }

          const mealDate = new Date(lastMeal.recorded_at);
          const dateStr = mealDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          const timeStr = mealDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

          const qty = lastMeal.quantity_offered ?? lastMeal.quantity;
          const unit = lastMeal.quantity_unit ?? lastMeal.unit;
          const qtyUnit = formatQty(qty, unit);
          const displayString = `${qtyUnit}${lastMeal.food_item || lastMeal.food_type || 'Diet'} @ ${dateStr} ${timeStr}`;

          return (
            <div className="w-full text-center">
              <span
                className="text-[9px] md:text-[10px] lg:text-[11px] font-bold text-slate-700 break-words whitespace-normal w-full block"
                title={displayString}
              >
                {displayString}
              </span>
            </div>
          );
        },
      }),

      columnHelper.accessor('next_feed', {
        id: 'next_feed',
        header: 'Next Feed',
        cell: (info) => {
          const nextFeed = info.getValue();
          if (!nextFeed) {
            return (
              <span className="text-slate-300 text-[10px] lg:text-xs font-medium py-0.5 block w-full text-center">
                -
              </span>
            );
          }

          const todayStr = getLocalDateString();
          const isOverdue = nextFeed.scheduled_date < todayStr;
          const isToday = nextFeed.scheduled_date === todayStr;

          const [y, m, d] = nextFeed.scheduled_date.split('T')[0].split('-');
          const safeDate = new Date(Number(y), Number(m) - 1, Number(d));
          const dateStr = safeDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

          const hasTime = nextFeed.scheduled_date.includes('T');
          const timeStr = hasTime
            ? ` ${safeDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
            : '';

          const qty = nextFeed.quantity;
          const unit = nextFeed.quantity_unit;
          const qtyUnit = formatQty(qty, unit);
          const displayString = `${qtyUnit}${nextFeed.food_type || 'Diet'} @ ${dateStr}${timeStr}`;

          if (isOverdue) {
            const diffTime = Math.abs(new Date(todayStr).getTime() - safeDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFeedActionAnimalId(info.row.original.id);
                  setFeedModalSchedule(nextFeed);
                  setIsFeedModalOpen(true);
                }}
                className="bg-rose-600 text-white animate-pulse border border-rose-800 px-1.5 md:px-2 py-0.5 lg:py-1 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-xs w-full max-w-[150px] mx-auto flex flex-col items-center justify-center text-center gap-0.5 cursor-pointer"
              >
                <span
                  className="text-[9px] md:text-[10px] lg:text-[11px] font-bold leading-tight break-words whitespace-normal w-full"
                  title={displayString}
                >
                  {displayString}
                </span>
                <span className="text-[7px] md:text-[8px] font-black tracking-widest uppercase text-rose-200">
                  MISSED • {diffDays}D LATE
                </span>
              </button>
            );
          }

          if (isToday) {
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFeedActionAnimalId(info.row.original.id);
                  setFeedModalSchedule(nextFeed);
                  setIsFeedModalOpen(true);
                }}
                className="bg-emerald-400 text-slate-950 border border-emerald-600 px-1.5 md:px-2 py-0.5 lg:py-1 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-xs w-full max-w-[150px] mx-auto flex flex-col items-center justify-center text-center gap-0.5 cursor-pointer"
              >
                <span
                  className="text-[9px] md:text-[10px] lg:text-[11px] font-bold leading-tight break-words whitespace-normal w-full"
                  title={displayString}
                >
                  {displayString}
                </span>
                <span className="text-[7px] md:text-[8px] font-black tracking-widest uppercase text-emerald-800">
                  TODAY
                </span>
              </button>
            );
          }

          return (
            <div className="bg-slate-800 text-white px-1.5 md:px-2 py-1 rounded-lg opacity-90 cursor-not-allowed w-full max-w-[150px] mx-auto flex items-center justify-center text-center">
              <span
                className="text-[9px] md:text-[10px] lg:text-[11px] font-bold leading-tight break-words whitespace-normal w-full text-slate-100"
                title={displayString}
              >
                {displayString}
              </span>
            </div>
          );
        },
      })
    );

    return cols;
  }, [screen.isMobile]);

  const columnVisibility = useMemo<VisibilityState>(() => {
    return {
      next_feed: activeTab === 'EXOTIC',
      location: !(activeTab === 'EXOTIC' && !screen.isDesktop),
    };
  }, [activeTab, screen.isDesktop]);

  const table = useTable<DashboardAnimalRow>({
    features,
    data: hierarchicalData,
    columns,
    state: { globalFilter, sorting, expanded, columnVisibility },
    autoResetExpanded: false,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
  });

  const categories = useMemo(() => {
    return Array.from(new Set(allAnimals.map((a) => a.category).filter(Boolean))).sort() as string[];
  }, [allAnimals]);

  const tabs = useMemo(() => [...categories, 'ARCHIVED'], [categories]);

  const tableGridCols = table
    .getVisibleLeafColumns()
    .map((c) => {
      if (c.id === 'name') {
        return screen.isMobile ? 'minmax(90px, 1.2fr)' : screen.isTablet ? 'minmax(110px, 1.2fr)' : 'minmax(120px, 1.1fr)';
      }
      if (c.id === 'species') {
        return screen.isMobile || screen.isTablet ? 'minmax(70px, 0.8fr)' : 'minmax(90px, 0.8fr)';
      }
      if (c.id === 'location') {
        return screen.isMobile || screen.isTablet ? 'minmax(60px, 0.8fr)' : 'minmax(90px, 0.8fr)';
      }
      if (c.id === 'today_weight') {
        return screen.isMobile ? 'minmax(60px, 0.6fr)' : screen.isTablet ? 'minmax(70px, 0.6fr)' : 'minmax(100px, 0.8fr)';
      }
      if (c.id === 'today_feed') {
        return screen.isMobile || screen.isTablet ? 'minmax(110px, 1.2fr)' : 'minmax(160px, 1.5fr)';
      }
      if (c.id === 'last_feed') {
        return screen.isMobile || screen.isTablet ? 'minmax(120px, 1.2fr)' : 'minmax(170px, 1.5fr)';
      }
      if (c.id === 'next_feed') {
        return screen.isMobile ? 'minmax(110px, 1.2fr)' : screen.isTablet ? 'minmax(110px, 1.1fr)' : 'minmax(150px, 1.2fr)';
      }
      return '1fr';
    })
    .join(' ');

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div className="shrink-0 pr-4">
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight">Dashboard</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateAnimalModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-95 shrink-0 cursor-pointer"
        >
          <Plus size={13} /> <span>Add Animal</span>
        </button>
      </div>

      {/* Filter and Date Ribbon */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search collections..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>

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
              onBlur={(e) => updateDate(e.target.value)}
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
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-4 lg:flex lg:gap-1.5 w-full shrink-0 gap-1">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-1.5 lg:px-3.5 py-1 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs cursor-pointer ${
              activeTab === tab
                ? tab === 'ARCHIVED'
                  ? 'bg-rose-500 text-white border border-rose-600 shadow-rose-500/20'
                  : 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Table View Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {(loadingAnimals || loadingLogs) && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100">
              <Loader2 className="animate-spin text-emerald-500" size={20} />
              <span className="text-xs font-bold text-slate-700">Syncing telemetry...</span>
            </div>
          </div>
        )}

        {/* Scrollable Rows Viewport */}
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative w-full min-h-0">
          <div className="min-w-[450px] xl:min-w-[800px] w-full">
            {/* Header Row */}
            <div
              className="grid border-b border-slate-200 bg-slate-50 text-[9px] lg:text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-20 backdrop-blur-md"
              style={{ gridTemplateColumns: tableGridCols }}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <Fragment key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isCentered = ['location', 'today_weight', 'today_feed', 'last_feed', 'next_feed'].includes(
                      header.column.id
                    );
                    return (
                      <div
                        key={header.id}
                        className={`px-1.5 sm:px-2.5 lg:px-4 py-2 flex items-center gap-1 lg:gap-1.5 cursor-pointer hover:bg-slate-200/50 transition-colors select-none ${
                          isCentered ? 'justify-center text-center' : 'justify-start text-left'
                        }`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ArrowUpDown size={11} className="text-emerald-500" />,
                          desc: <ArrowUpDown size={11} className="text-emerald-500 rotate-180" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-100 bg-white">
              {table.getRowModel().rows.length === 0 && !(loadingAnimals || loadingLogs) ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-3 border border-slate-200 shadow-xs">
                    <Search size={20} className="text-slate-400" />
                  </div>
                  <p className="font-black text-slate-700 mb-0.5 text-xs tracking-tight">No collections found</p>
                  <p className="text-[10px] font-medium text-slate-400">Adjust your search or category filters.</p>
                </div>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isGroupHeader = row.original.record_type === 'GROUP';
                  const isExpanded = row.getIsExpanded();

                  return (
                    <div
                      key={row.id}
                      className={`grid border-b border-slate-100 hover:bg-slate-50/80 transition-colors group cursor-pointer ${
                        isExpanded ? 'bg-emerald-50/25' : 'bg-white'
                      } ${isGroupHeader ? 'bg-slate-50/60' : ''}`}
                      style={{ gridTemplateColumns: tableGridCols }}
                      onClick={() => {
                        if (!isGroupHeader) {
                          setSelectedAnimalId(row.original.id);
                        }
                      }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const isCentered = [
                          'location',
                          'today_weight',
                          'today_feed',
                          'last_feed',
                          'next_feed',
                        ].includes(cell.column.id);
                        return (
                          <div
                            key={cell.id}
                            className={`px-1.5 sm:px-2.5 lg:px-4 py-1.5 flex items-center min-w-0 ${
                              isCentered ? 'justify-center text-center' : 'justify-start text-left'
                            }`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Intake / Animal Intake Modal */}
      {isCreateAnimalModalOpen && (
        <AnimalFormModal
          isOpen={isCreateAnimalModalOpen}
          onClose={() => setIsCreateAnimalModalOpen(false)}
        />
      )}

      {/* Individual Specimen Profile Modal */}
      {selectedAnimal && selectedAnimal.record_type === 'INDIVIDUAL' && (
        <AnimalProfile
          onClose={() => setSelectedAnimalId(null)}
          animal={selectedAnimal}
        />
      )}

      {/* Mob / Group Profile Modal */}
      {selectedAnimal && selectedAnimal.record_type === 'GROUP' && (
        <MobProfile
          onClose={() => setSelectedAnimalId(null)}
          mob={selectedAnimal}
          members={allAnimals.filter((a) => a.parent_group_id === selectedAnimal.id)}
        />
      )}

      {/* 1-Tap Scheduled Feed Resolution Modal */}
      {isFeedModalOpen && feedActionAnimalId && (
        <FeedModal
          isOpen={isFeedModalOpen}
          onClose={() => {
            setIsFeedModalOpen(false);
            setFeedActionAnimalId(null);
            setFeedModalSchedule(null);
          }}
          animalId={feedActionAnimalId}
          scheduledFeed={feedModalSchedule}
        />
      )}
    </div>
  );
}