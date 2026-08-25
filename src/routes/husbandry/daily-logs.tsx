import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  useTable,
  tableFeatures,
  createColumnHelper,
  flexRender,
  type SortingState,
  type VisibilityState,
  rowSortingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Scale,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Apple,
  CheckCircle2,
  Users,
  User,
  ArrowUpDown,
  ThermometerSun,
  Plus,
  Calendar,
  Droplets,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Animal, FeedLog, WeightLog, TemperatureLog, MistLog } from '../../types';

import { FeedModal } from '../../components/husbandry/FeedModal';
import { WeightModal } from '../../components/husbandry/WeightModal';
import { TemperatureModal } from '../../components/husbandry/TemperatureModal';
import { MistModal } from '../../components/husbandry/MistModal';

export const Route = createFileRoute('/husbandry/daily-logs')({
  component: HusbandryLogs,
});

interface DailyLogAnimalRow extends Animal {
  feedLogs: FeedLog[];
  weightLog: WeightLog | null;
  tempLog: TemperatureLog | null;
  mistLog: MistLog | null;
}

const CATEGORY_TABS = [
  { id: 'OWL', label: 'Owl' },
  { id: 'RAPTOR', label: 'Raptor' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotics' },
] as const;

const EMPTY_ARRAY: never[] = [];
const GRAMS_PER_OZ = 28.349523125;

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
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

const getSafeISOStart = (dateString: string): string => {
  if (!isValidDateString(dateString)) return new Date().toISOString();
  return new Date(`${dateString}T00:00:00.000Z`).toISOString();
};

const getSafeISOEnd = (dateString: string): string => {
  if (!isValidDateString(dateString)) return new Date().toISOString();
  return new Date(`${dateString}T23:59:59.999Z`).toISOString();
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

// ============================================================================
// CELL ACTION COMPONENTS
// ============================================================================

interface ModalTriggerPayload<T = any> {
  isOpen: boolean;
  animalId?: string | null;
  animal?: Animal | null;
  initialData?: T;
}

function FeedCell({
  animal,
  logs,
  onOpenModal,
}: {
  animal: Animal;
  logs: FeedLog[];
  onOpenModal: (data: ModalTriggerPayload<FeedLog>) => void;
}) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {logs.map((log) => {
        const timeStr = log.recorded_at
          ? new Date(log.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          : '';

        const qty = log.quantity_offered ?? log.quantity ?? '';
        const rawUnit = log.quantity_unit ?? log.unit ?? '';
        const unit =
          rawUnit.toLowerCase().includes('whole') || rawUnit.toLowerCase().includes('item')
            ? 'x'
            : rawUnit;
        const food = log.food_item ?? log.food_type ?? 'Diet';

        let qtyStr = qty ? `${qty}${unit} ${food}` : food;
        if (timeStr) qtyStr += ` @ ${timeStr}`;

        return (
          <button
            key={log.id}
            type="button"
            onClick={() => onOpenModal({ isOpen: true, animalId: animal.id, initialData: log })}
            className="flex items-center justify-center text-center text-emerald-800 bg-emerald-50/90 px-2.5 py-1.5 rounded-lg border border-emerald-200 w-full shadow-xs hover:bg-emerald-100 transition-colors gap-1.5 cursor-pointer"
          >
            <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
            <span className="text-[11px] font-bold whitespace-normal break-words leading-tight truncate">
              {qtyStr}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animalId: animal.id })}
        className={`flex items-center justify-center text-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 w-full shadow-xs transition-colors cursor-pointer ${
          logs.length > 0
            ? 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 border-dashed'
            : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
        }`}
      >
        {logs.length > 0 ? <Plus size={13} /> : <Apple size={13} />}
        {logs.length > 0 ? 'Add Feed' : 'Log Feed'}
      </button>
    </div>
  );
}

function WeightCell({
  animal,
  log,
  onOpenModal,
}: {
  animal: Animal;
  log: WeightLog | null;
  onOpenModal: (data: ModalTriggerPayload<WeightLog>) => void;
}) {
  const targetUnit = animal.preferred_weight_unit || animal.weight_unit || 'g';

  if (log) {
    return (
      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animalId: animal.id, initialData: log })}
        className="flex items-center justify-center text-center text-emerald-800 bg-emerald-50/90 px-2.5 py-1.5 rounded-lg border border-emerald-200 w-full shadow-xs hover:bg-emerald-100 transition-colors gap-1.5 cursor-pointer"
      >
        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
        <span className="text-[11px] font-black whitespace-normal break-words leading-tight">
          {formatWeightDisplay(log.weight_grams, targetUnit)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenModal({ isOpen: true, animalId: animal.id })}
      className="flex items-center justify-center text-center gap-1.5 bg-white text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold active:scale-95 w-full shadow-xs transition-colors cursor-pointer"
    >
      <Scale size={13} className="text-slate-400 shrink-0" /> Log Weight
    </button>
  );
}

function TempCell({
  animal,
  log,
  onOpenModal,
}: {
  animal: Animal;
  log: TemperatureLog | null;
  onOpenModal: (data: ModalTriggerPayload<TemperatureLog>) => void;
}) {
  if (log) {
    let tempStr = 'Recorded';
    if (log.temp_ambient !== null && log.temp_ambient !== undefined) {
      tempStr = `${log.temp_ambient}°C Amb`;
    } else if (log.temp_basking !== null && log.temp_cool !== null) {
      tempStr = `${log.temp_basking}°C / ${log.temp_cool}°C`;
    } else if (log.temp_basking !== null) {
      tempStr = `${log.temp_basking}°C Bask`;
    }

    return (
      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animal, initialData: log })}
        className="flex items-center justify-center text-center text-orange-800 bg-orange-50/90 px-2.5 py-1.5 rounded-lg border border-orange-200 w-full shadow-xs hover:bg-orange-100 transition-colors gap-1.5 cursor-pointer"
      >
        <CheckCircle2 size={13} className="text-orange-600 shrink-0" />
        <span className="text-[11px] font-bold whitespace-normal break-words leading-tight truncate">
          {tempStr}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenModal({ isOpen: true, animal })}
      className="flex items-center justify-center text-center gap-1.5 bg-white text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold active:scale-95 w-full shadow-xs transition-colors cursor-pointer"
    >
      <ThermometerSun size={13} className="text-slate-400 shrink-0" /> Log Temp
    </button>
  );
}

function MistCell({
  animal,
  log,
  activeDate,
  onOpenModal,
}: {
  animal: Animal;
  log: MistLog | null;
  activeDate: string;
  onOpenModal: (data: ModalTriggerPayload<MistLog>) => void;
}) {
  if (log) {
    const level = log.mist_level
      ? log.mist_level.charAt(0).toUpperCase() + log.mist_level.slice(1).toLowerCase()
      : 'Logged';
    const ampm = log.am_pm ? log.am_pm.toUpperCase() : '';
    const mistStr = `${level} Mist ${ampm}`.trim();

    return (
      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animal, initialData: log })}
        className="flex items-center justify-center text-center text-cyan-800 bg-cyan-50/90 px-2.5 py-1.5 rounded-lg border border-cyan-200 w-full shadow-xs hover:bg-cyan-100 transition-colors gap-1.5 cursor-pointer"
      >
        <CheckCircle2 size={13} className="text-cyan-600 shrink-0" />
        <span className="text-[11px] font-bold whitespace-normal break-words leading-tight truncate">
          {mistStr}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        onOpenModal({
          isOpen: true,
          animal,
          initialData: { log_date: activeDate } as any,
        })
      }
      className="flex items-center justify-center text-center gap-1.5 bg-white text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold active:scale-95 w-full shadow-xs transition-colors cursor-pointer"
    >
      <Droplets size={13} className="text-slate-400 shrink-0" /> Log Mist
    </button>
  );
}

const columnHelper = createColumnHelper<DailyLogAnimalRow>();

// ============================================================================
// MAIN ROUTE COMPONENT
// ============================================================================

function HusbandryLogs() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);

  const [activeDate, setActiveDate] = useState<string>(() => getLocalDateString());
  const [inputDate, setInputDate] = useState<string>(() => getLocalDateString());

  // Default initial active category is 'OWL'
  const [activeTab, setActiveTab] = useState<string>('OWL');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Modal Control States
  const [feedModalState, setFeedModalState] = useState<ModalTriggerPayload<FeedLog>>({
    isOpen: false,
    animalId: null,
  });
  const [weightModalState, setWeightModalState] = useState<ModalTriggerPayload<WeightLog>>({
    isOpen: false,
    animalId: null,
  });
  const [tempModalState, setTempModalState] = useState<ModalTriggerPayload<TemperatureLog>>({
    isOpen: false,
    animal: null,
  });
  const [mistModalState, setMistModalState] = useState<ModalTriggerPayload<MistLog>>({
    isOpen: false,
    animal: null,
  });

  // 1. Specimen Registry Query
  const { data: animals = EMPTY_ARRAY, isLoading: loadingAnimals } = useQuery<Animal[]>({
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

  // 2. Feed Logs Query
  const { data: feedLogs = EMPTY_ARRAY, isLoading: loadingFeeds } = useQuery<FeedLog[]>({
    queryKey: ['feeds', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
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
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // 3. Weight Logs Query
  const { data: weightLogs = EMPTY_ARRAY, isLoading: loadingWeights } = useQuery<WeightLog[]>({
    queryKey: ['weights', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
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
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // 4. Temperature Logs Query
  const { data: tempLogs = EMPTY_ARRAY, isLoading: loadingTemps } = useQuery<TemperatureLog[]>({
    queryKey: ['temperatures', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
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
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // 5. Misting Logs Query
  const { data: mistLogs = EMPTY_ARRAY, isLoading: loadingMists } = useQuery<MistLog[]>({
    queryKey: ['mist_logs', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
      const { data, error } = await supabase
        .from('mist_logs')
        .select('*')
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MistLog[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  const isLoading =
    loadingAnimals || loadingFeeds || loadingWeights || loadingTemps || loadingMists;

  // Real-time Subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('daily-logs-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['feeds'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['weights'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temperature_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['temperatures'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mist_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['mist_logs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Date Navigator Helpers
  const updateDate = (newDate: string) => {
    if (isValidDateString(newDate)) {
      setActiveDate(newDate);
      setInputDate(newDate);
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
    updateDate(getLocalDateString(dateObj));
  };

  const jumpToToday = () => {
    updateDate(getLocalDateString());
  };

  // Status Maps
  const feedStatus = useMemo(() => {
    const map = new Map<string, FeedLog[]>();
    feedLogs.forEach((log) => {
      if (!map.has(log.animal_id)) map.set(log.animal_id, []);
      map.get(log.animal_id)!.push(log);
    });
    return map;
  }, [feedLogs]);

  const weightStatus = useMemo(() => {
    const map = new Map<string, WeightLog>();
    weightLogs.forEach((log) => {
      if (!map.has(log.animal_id)) map.set(log.animal_id, log);
    });
    return map;
  }, [weightLogs]);

  const tempStatus = useMemo(() => {
    const map = new Map<string, TemperatureLog>();
    tempLogs.forEach((log) => {
      if (!map.has(log.animal_id)) map.set(log.animal_id, log);
    });
    return map;
  }, [tempLogs]);

  const mistStatus = useMemo(() => {
    const map = new Map<string, MistLog>();
    mistLogs.forEach((log) => {
      if (!map.has(log.animal_id)) map.set(log.animal_id, log);
    });
    return map;
  }, [mistLogs]);

  // Filter animals strictly by selected category (excluding ARCHIVED)
  const tableData = useMemo<DailyLogAnimalRow[]>(() => {
    let filtered = animals.filter((a) => a.status !== 'ARCHIVED');

    filtered = filtered.filter((a) => {
      const cat = (a.category || '').toUpperCase();
      if (activeTab === 'EXOTIC') {
        return cat === 'EXOTIC' || cat === 'EXOTICS';
      }
      return cat === activeTab;
    });

    if (globalFilter) {
      const q = globalFilter.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.species && a.species.toLowerCase().includes(q)) ||
          (a.ring_number && a.ring_number.toLowerCase().includes(q))
      );
    }

    return filtered.map((animal) => ({
      ...animal,
      feedLogs: feedStatus.get(animal.id) || [],
      weightLog: weightStatus.get(animal.id) || null,
      tempLog: tempStatus.get(animal.id) || null,
      mistLog: mistStatus.get(animal.id) || null,
    }));
  }, [animals, activeTab, globalFilter, feedStatus, weightStatus, tempStatus, mistStatus]);

  // TanStack Table Columns
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Animal',
        cell: (info) => {
          const animal = info.row.original;
          const isGroup = animal.record_type === 'GROUP';

          return (
            <div className="flex items-center gap-2.5 min-w-0 py-0.5">
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

              <div className="min-w-0 flex-1">
                <h3
                  className="font-bold text-slate-900 text-xs lg:text-[13px] tracking-tight truncate"
                  title={animal.name}
                >
                  {animal.name}
                </h3>
                <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-400 truncate mt-0.5 font-bold">
                  {animal.ring_number && (
                    <span className="uppercase tracking-widest">{animal.ring_number}</span>
                  )}
                  {animal.ring_number && animal.species && <span>•</span>}
                  {animal.species && <span className="italic truncate">{animal.species}</span>}
                </div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'feed',
        header: 'Feed Log',
        cell: (info) => (
          <FeedCell
            animal={info.row.original}
            logs={info.row.original.feedLogs}
            onOpenModal={setFeedModalState}
          />
        ),
      }),
      columnHelper.display({
        id: 'weight',
        header: 'Weight Log',
        cell: (info) => (
          <WeightCell
            animal={info.row.original}
            log={info.row.original.weightLog}
            onOpenModal={setWeightModalState}
          />
        ),
      }),
      columnHelper.display({
        id: 'temp',
        header: 'Temp Log',
        cell: (info) => (
          <TempCell
            animal={info.row.original}
            log={info.row.original.tempLog}
            onOpenModal={setTempModalState}
          />
        ),
      }),
      columnHelper.display({
        id: 'mist',
        header: 'Mist Log',
        cell: (info) => (
          <MistCell
            animal={info.row.original}
            log={info.row.original.mistLog}
            activeDate={activeDate}
            onOpenModal={setMistModalState}
          />
        ),
      }),
    ],
    [activeDate]
  );

  const columnVisibility = useMemo<VisibilityState>(() => {
    return {
      mist: activeTab === 'EXOTIC',
    };
  }, [activeTab]);

  const table = useTable<DailyLogAnimalRow>({
    features,
    data: tableData,
    columns,
    state: { globalFilter, sorting, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
  });

  const { rows } = table.getRowModel();

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? 190 : 76),
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const visibleColsCount = table.getVisibleLeafColumns().length;
  const tableGridCols =
    visibleColsCount === 5
      ? 'minmax(180px, 1.4fr) minmax(130px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr)'
      : 'minmax(200px, 1.8fr) minmax(140px, 1.2fr) minmax(120px, 1fr) minmax(120px, 1fr)';

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div className="shrink-0 pr-4">
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight">Daily Logs</h1>
        </div>
      </div>

      {/* Control Deck */}
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

        <div className="flex items-center justify-end gap-2 w-full sm:w-auto shrink-0">
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
                onBlur={(e) => updateDate(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && updateDate(e.currentTarget.value)}
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

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100">
              <Loader2 className="animate-spin text-emerald-500" size={20} />
              <span className="text-xs font-bold text-slate-700">Syncing daily records...</span>
            </div>
          </div>
        )}

        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50/30"
        >
          {/* Desktop Table Header */}
          <div
            className="hidden lg:grid border-b border-slate-200 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-20 backdrop-blur-md"
            style={{ gridTemplateColumns: tableGridCols }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <Fragment key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => (
                  <div
                    key={header.id}
                    className={`px-4 py-2.5 flex items-center gap-1.5 cursor-pointer hover:bg-slate-200/50 transition-colors select-none ${
                      index === 0 ? 'justify-start text-left' : 'justify-center text-center'
                    }`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: <ArrowUpDown size={11} className="text-emerald-500" />,
                      desc: <ArrowUpDown size={11} className="text-emerald-500 rotate-180" />,
                    }[header.column.getIsSorted() as string] ?? null}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>

          <div className="p-2 lg:p-0">
            {rows.length === 0 && !isLoading ? (
              <div className="p-8 lg:p-12 text-center text-slate-500 flex flex-col items-center">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-3 border border-slate-200 shadow-xs">
                  <Search size={20} className="text-slate-400" />
                </div>
                <p className="font-black text-slate-700 mb-0.5 text-xs tracking-tight">
                  No specimens found
                </p>
                <p className="text-[10px] font-medium text-slate-400">
                  Try adjusting your search or category filters.
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
                  const row = rows[virtualRow.index]!;
                  return (
                    <div
                      key={row.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full grid grid-cols-1 lg:grid border border-slate-200 lg:border-none lg:border-b border-b-slate-100 rounded-xl lg:rounded-none bg-white p-2.5 lg:p-0 hover:bg-slate-50/80 transition-colors shadow-xs lg:shadow-none gap-2 lg:gap-0 box-border mb-2 lg:mb-0"
                      style={{
                        gridTemplateColumns: isMobile ? '1fr' : tableGridCols,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {row.getVisibleCells().map((cell, index) => (
                        <div
                          key={cell.id}
                          className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                            isMobile ? 'flex-col' : 'items-center justify-center'
                          }`}
                        >
                          {isMobile && index !== 0 && (
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 text-center w-full">
                              {flexRender(cell.column.columnDef.header, cell.getContext())}
                            </div>
                          )}
                          <div
                            className={`w-full ${index !== 0 && !isMobile ? 'flex justify-center' : ''}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Invocations */}
      {feedModalState.isOpen && feedModalState.animalId && (
        <FeedModal
          isOpen={feedModalState.isOpen}
          animalId={feedModalState.animalId}
          initialData={feedModalState.initialData}
          selectedDate={activeDate}
          onClose={() => setFeedModalState({ isOpen: false, animalId: null, initialData: undefined })}
        />
      )}

      {weightModalState.isOpen && weightModalState.animalId && (
        <WeightModal
          isOpen={weightModalState.isOpen}
          animalId={weightModalState.animalId}
          initialData={weightModalState.initialData}
          selectedDate={activeDate}
          onClose={() => setWeightModalState({ isOpen: false, animalId: null, initialData: undefined })}
        />
      )}

      {tempModalState.isOpen && tempModalState.animal && (
        <TemperatureModal
          isOpen={tempModalState.isOpen}
          animal={tempModalState.animal}
          animalId={tempModalState.animal.id}
          ambientOnly={tempModalState.animal.ambient_temp_only || false}
          initialData={tempModalState.initialData}
          selectedDate={activeDate}
          onClose={() => setTempModalState({ isOpen: false, animal: null, initialData: undefined })}
        />
      )}

      {mistModalState.isOpen && mistModalState.animal && (
        <MistModal
          isOpen={mistModalState.isOpen}
          animal={mistModalState.animal}
          animalId={mistModalState.animal.id}
          initialData={mistModalState.initialData}
          selectedDate={activeDate}
          onClose={() => setMistModalState({ isOpen: false, animal: null, initialData: undefined })}
        />
      )}
    </div>
  );
}

export default HusbandryLogs;