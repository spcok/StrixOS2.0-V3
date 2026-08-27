import { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, keepPreviousData, queryOptions } from '@tanstack/react-query';
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
  ChevronDown, 
  CornerDownRight 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Animal, FeedLog, WeightLog, TemperatureLog, MistLog } from '../../types';

import { FeedModal } from '../../components/husbandry/FeedModal';
import { WeightModal } from '../../components/husbandry/WeightModal';
import { TemperatureModal } from '../../components/husbandry/TemperatureModal';
import { MistModal } from '../../components/husbandry/MistModal';

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  return isMobile;
}

const getLocalDateString = (d = new Date()): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isValidDateString = (dateString: string): boolean => {
  if (!dateString || dateString.length !== 10) return false;
  const d = new Date(dateString);
  return d instanceof Date && !isNaN(d.getTime());
};

const getSafeISOStart = (dateString: string): string => {
  if (!isValidDateString(dateString)) return new Date().toISOString();
  return new Date(`${dateString}T00:00:00.000Z`).toISOString();
};

const getSafeISOEnd = (dateString: string): string => {
  if (!isValidDateString(dateString)) return new Date().toISOString();
  return new Date(`${dateString}T23:59:59.999Z`).toISOString();
};

const GRAMS_PER_OZ = 28.349523125;

export const formatWeightDisplay = (grams: number | null | undefined, unit: string): string | null => {
  if (!grams) return null;
  if (unit === 'kg') return `${(grams / 1000).toFixed(3)}kg`;
  if (unit === 'lb') {
    const totalOunces = grams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let e = Math.round((totalOunces - totalOzInt) * 8);
    if (e >= 8) { totalOzInt += 1; e = 0; }
    const lb = Math.floor(totalOzInt / 16);
    const oz = totalOzInt % 16;
    let str = '';
    if (lb > 0) str += `${lb}lb `;
    if (oz > 0 || e > 0) str += `${oz}`;
    if (e > 0) str += ` ${e}/8`;
    if (oz > 0 || e > 0) str += 'oz';
    return str.trim() || '0lb';
  }
  if (unit === 'oz') {
    const totalOunces = grams / GRAMS_PER_OZ;
    let totalOzInt = Math.floor(totalOunces);
    let e = Math.round((totalOunces - totalOzInt) * 8);
    if (e >= 8) { totalOzInt += 1; e = 0; }
    let str = `${totalOzInt}`;
    if (e > 0) str += ` ${e}/8`;
    return `${str}oz`;
  }
  return `${Math.round(grams)}g`;
};

interface AnimalRowData extends Animal {
  isGroupParent?: boolean;
  isChildMember?: boolean;
  childCount?: number;
  weighedCount?: number;
  parentGroupId?: string;
  parentGroupName?: string;
  feedLogs: FeedLog[];
  weightLog?: WeightLog;
  tempLog?: TemperatureLog;
  mistLog?: MistLog;
}

// ------------------------------------------------------------------
// 1. QUERY OPTIONS
// ------------------------------------------------------------------
const animalsHusbandryOptions = queryOptions({
  queryKey: ['animals', 'husbandry'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('*').order('name');
    if (error) throw error;
    return (data || []) as Animal[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/husbandry/daily-logs')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(animalsHusbandryOptions);
  },
  component: HusbandryLogs,
});

// ------------------------------------------------------------------
// 2. ISOLATED CELL COMPONENTS
// ------------------------------------------------------------------
const FeedCell = ({ 
  animal, 
  logs, 
  onOpenModal,
  isGroupParent 
}: { 
  animal: any; 
  logs: any[]; 
  onOpenModal: (data: any) => void;
  isGroupParent?: boolean;
}) => {
  return (
    <div className="flex flex-col gap-1.5 w-full text-left">
      {logs.map((log: any) => {
        const timeStr = log.recorded_at ? new Date(log.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
        
        const qty = log.quantity_offered ?? log.amount_offered ?? log.amount ?? log.quantity ?? '';
        const rawUnit = log.quantity_unit ?? log.unit ?? '';
        const unit = rawUnit.toLowerCase().includes('whole') ? 'x' : rawUnit;
        const food = log.food_item ?? log.food_type ?? log.feed_details ?? log.food ?? 'Feed';

        let qtyStr = qty ? `${qty}${unit} ${food}` : food;
        if (timeStr) qtyStr += ` @ ${timeStr}`;

        return (
          <button
            key={log.id}
            type="button"
            onClick={() => onOpenModal({ isOpen: true, animalId: animal.id, animal, initialData: log })}
            className="flex items-center justify-center text-center text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 w-full shadow-xs hover:bg-emerald-100 transition-colors gap-2 cursor-pointer"
          >
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold whitespace-normal break-words leading-tight">
              {qtyStr}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animalId: animal.id, animal })}
        className={`flex items-center justify-center text-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium active:scale-95 w-full shadow-xs transition-colors cursor-pointer ${
          logs.length > 0 
            ? 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 border-dashed'
            : isGroupParent 
            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold'
            : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
        }`}
      >
        {logs.length > 0 ? <Plus size={14} /> : (isGroupParent ? <Users size={14} /> : <Apple size={14} />)}
        {logs.length > 0 ? (isGroupParent ? 'Add Mob Feed' : 'Add Feed') : (isGroupParent ? 'Log Mob Feed' : 'Log Feed')}
      </button>
    </div>
  );
};

const WeightCell = ({ 
  animal, 
  log, 
  onOpenModal,
  isGroupParent,
  childCount = 0,
  weighedCount = 0,
  isExpanded,
  onToggleExpand
}: { 
  animal: any; 
  log: any; 
  onOpenModal: (data: any) => void;
  isGroupParent?: boolean;
  childCount?: number;
  weighedCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) => {
  const targetUnit = animal.preferred_weight_unit || animal.weight_unit || 'g';

  if (isGroupParent) {
    const someWeighed = weighedCount > 0;
    const allWeighed = childCount > 0 && weighedCount === childCount;

    return (
      <button
        type="button"
        onClick={onToggleExpand}
        className={`flex items-center justify-center text-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold active:scale-95 w-full shadow-xs transition-all cursor-pointer ${
          allWeighed
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            : someWeighed
            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200 border-dashed'
        }`}
        title={isExpanded ? 'Collapse Mob' : 'Expand Mob to record individual weights'}
      >
        <Scale size={13} className={someWeighed ? 'text-emerald-500' : 'text-slate-400'} />
        <span>
          {someWeighed ? `${weighedCount}/${childCount} Weighed` : `Expand for Weights (${childCount})`}
        </span>
        {isExpanded ? <ChevronDown size={13} className="ml-0.5 opacity-60" /> : <ChevronRight size={13} className="ml-0.5 opacity-60" />}
      </button>
    );
  }

  if (log) {
    return (
      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animalId: animal.id, initialData: log })}
        className="flex items-center justify-center text-center text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 w-full shadow-xs hover:bg-emerald-100 transition-colors gap-2 cursor-pointer"
      >
        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        <span className="text-xs font-semibold whitespace-normal break-words leading-tight">
          {formatWeightDisplay(log.weight_grams, targetUnit)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenModal({ isOpen: true, animalId: animal.id })}
      className="flex items-center justify-center text-center gap-1.5 bg-white text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium active:scale-95 w-full shadow-xs transition-colors cursor-pointer"
    >
      <Scale size={14} className="text-slate-400 shrink-0" /> Log Weight
    </button>
  );
};

const TempCell = ({ animal, log, onOpenModal }: { animal: any; log: any; onOpenModal: (data: any) => void }) => {
  if (log) {
    let tempStr = 'Temped';
    if (log.temp_ambient) tempStr = `${log.temp_ambient}°C Amb`;
    else if (log.temp_basking && log.temp_cool) tempStr = `${log.temp_basking}°C / ${log.temp_cool}°C`;
    else if (log.temp_basking) tempStr = `${log.temp_basking}°C Bask`;
    else if (log.day_temp_c) tempStr = `${log.day_temp_c}°C Day`;

    return (
      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animal: animal, initialData: log })}
        className="flex items-center justify-center text-center text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 w-full shadow-xs hover:bg-emerald-100 transition-colors gap-2 cursor-pointer"
      >
        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        <span className="text-xs font-semibold whitespace-normal break-words leading-tight">
          {tempStr}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpenModal({ isOpen: true, animal: animal })}
      className="flex items-center justify-center text-center gap-1.5 bg-white text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium active:scale-95 w-full shadow-xs transition-colors cursor-pointer"
    >
      <ThermometerSun size={14} className="text-slate-400 shrink-0" /> Log Temp
    </button>
  );
};

const MistCell = ({ 
  animal, 
  log, 
  activeDate, 
  onOpenModal 
}: { 
  animal: any; 
  log: any; 
  activeDate: string; 
  onOpenModal: (data: any) => void;
}) => {
  const isMistingNotRequired = 
    animal?.misting_not_required === true || 
    animal?.mist_not_required === true || 
    animal?.misting_required === false ||
    animal?.requires_misting === false;

  if (log) {
    const level = log.mist_level ? log.mist_level.charAt(0).toUpperCase() + log.mist_level.slice(1).toLowerCase() : 'Logged';
    const ampm = log.am_pm ? log.am_pm.toUpperCase() : '';
    const mistStr = `${level} Mist ${ampm}`.trim();

    return (
      <button
        type="button"
        onClick={() => onOpenModal({ isOpen: true, animal, initialData: log })}
        className="flex items-center justify-center text-center text-cyan-700 bg-cyan-50 px-3 py-2 rounded-lg border border-cyan-200 w-full shadow-xs hover:bg-cyan-100 transition-colors gap-2 cursor-pointer"
      >
        <CheckCircle2 size={14} className="text-cyan-500 shrink-0" />
        <span className="text-xs font-semibold whitespace-normal break-words leading-tight">
          {mistStr}
        </span>
      </button>
    );
  }

  if (isMistingNotRequired) {
    return (
      <div 
        className="flex items-center justify-center text-center gap-1.5 bg-slate-100 text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold select-none cursor-not-allowed w-full shadow-2xs"
        title="Misting not required for this specimen"
      >
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Not Required</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenModal({ isOpen: true, animal, initialData: { log_date: activeDate } })}
      className="flex items-center justify-center text-center gap-1.5 bg-white text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium active:scale-95 w-full shadow-xs transition-colors cursor-pointer"
    >
      <Droplets size={14} className="text-slate-400 shrink-0" /> Log Mist
    </button>
  );
};

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function HusbandryLogs() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);
  
  const [activeDate, setActiveDate] = useState<string>(getLocalDateString());
  const [inputDate, setInputDate] = useState<string>(getLocalDateString());
  
  const [activeTab, setActiveTab] = useState('ALL');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [expandedMobs, setExpandedMobs] = useState<Set<string>>(new Set());
  
  const [feedModalState, setFeedModalState] = useState<{ isOpen: boolean; animalId: string | null; animal?: Animal | null; initialData?: any }>({ isOpen: false, animalId: null, animal: null, initialData: undefined });
  const [weightModalState, setWeightModalState] = useState<{ isOpen: boolean; animalId: string | null; initialData?: any }>({ isOpen: false, animalId: null, initialData: undefined });
  const [tempModalState, setTempModalState] = useState<{ isOpen: boolean; animal: Animal | null; initialData?: any }>({ isOpen: false, animal: null, initialData: undefined });
  const [mistModalState, setMistModalState] = useState<{ isOpen: boolean; animal: Animal | null; initialData?: any }>({ isOpen: false, animal: null, initialData: undefined });

  const { data: animals = [], isLoading: loadingAnimals } = useQuery(animalsHusbandryOptions);

  const { data: feedLogs = [], isLoading: loadingFeeds } = useQuery({
    queryKey: ['feeds', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
      const { data, error } = await supabase
        .from('feed_logs')
        .select('*')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as FeedLog[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  const { data: weightLogs = [], isLoading: loadingWeights } = useQuery({
    queryKey: ['weights', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as WeightLog[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  const { data: tempLogs = [], isLoading: loadingTemps } = useQuery({
    queryKey: ['temperatures', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
      const { data, error } = await supabase
        .from('temperature_logs')
        .select('*')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TemperatureLog[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  const { data: mistLogs = [], isLoading: loadingMists } = useQuery({
    queryKey: ['mist_logs', activeDate],
    queryFn: async () => {
      const start = getSafeISOStart(activeDate);
      const end = getSafeISOEnd(activeDate);
      const { data, error } = await supabase
        .from('mist_logs')
        .select('*')
        .or('is_deleted.eq.false,is_deleted.is.null')
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as MistLog[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true }
  });

  const isLoading = loadingAnimals || loadingFeeds || loadingWeights || loadingTemps || loadingMists;

  useEffect(() => {
    const channel = supabase.channel('daily-logs-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_logs' }, () => queryClient.invalidateQueries({ queryKey: ['feeds'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_logs' }, () => queryClient.invalidateQueries({ queryKey: ['weights'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temperature_logs' }, () => queryClient.invalidateQueries({ queryKey: ['temperatures'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mist_logs' }, () => queryClient.invalidateQueries({ queryKey: ['mist_logs'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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
    
    const newDateString = getLocalDateString(dateObj);
    updateDate(newDateString);
  };

  const jumpToToday = () => {
    updateDate(getLocalDateString());
  };

  const toggleMob = (mobId: string) => {
    setExpandedMobs(prev => {
      const next = new Set(prev);
      if (next.has(mobId)) {
        next.delete(mobId);
      } else {
        next.add(mobId);
      }
      return next;
    });
  };

  const feedMap = useMemo(() => {
    const map = new Map<string, any[]>();
    feedLogs.forEach(log => {
      if (log.is_deleted) return;
      const existing = map.get(log.animal_id) || [];
      existing.push(log);
      map.set(log.animal_id, existing);
    });
    return map;
  }, [feedLogs]);

  const weightStatus = useMemo(() => {
    const map = new Map();
    weightLogs.forEach(log => {
      if (!log.is_deleted && !map.has(log.animal_id)) {
        map.set(log.animal_id, log); 
      }
    });
    return map;
  }, [weightLogs]);

  const tempStatus = useMemo(() => {
    const map = new Map();
    tempLogs.forEach(log => {
      if (!log.is_deleted && !map.has(log.animal_id)) {
        map.set(log.animal_id, log); 
      }
    });
    return map;
  }, [tempLogs]);

  const mistStatus = useMemo(() => {
    const map = new Map();
    mistLogs.forEach(log => {
      if (!log.is_deleted && !map.has(log.animal_id)) {
        map.set(log.animal_id, log); 
      }
    });
    return map;
  }, [mistLogs]);

  useEffect(() => {
    if (!globalFilter.trim()) return;
    const q = globalFilter.toLowerCase();
    
    const mobsToExpand = new Set<string>();
    animals.forEach(a => {
      if (a.parent_group_id) {
        const matches = 
          a.name.toLowerCase().includes(q) ||
          (a.species && a.species.toLowerCase().includes(q)) ||
          (a.ring_number && a.ring_number.toLowerCase().includes(q));
        
        if (matches) {
          mobsToExpand.add(a.parent_group_id);
        }
      }
    });

    if (mobsToExpand.size > 0) {
      setExpandedMobs(prev => {
        const next = new Set(prev);
        mobsToExpand.forEach(id => next.add(id));
        return next;
      });
    }
  }, [globalFilter, animals]);

  const tableData = useMemo<AnimalRowData[]>(() => {
    const activeAnimals = animals.filter(a => a.status !== 'ARCHIVED');

    const childrenByParent = new Map<string, Animal[]>();
    const parentGroups: Animal[] = [];
    const standaloneIndividuals: Animal[] = [];

    activeAnimals.forEach(a => {
      if (a.record_type === 'GROUP') {
        parentGroups.push(a);
      } else if (a.parent_group_id) {
        const existing = childrenByParent.get(a.parent_group_id) || [];
        existing.push(a);
        childrenByParent.set(a.parent_group_id, existing);
      } else {
        standaloneIndividuals.push(a);
      }
    });

    const topLevelEntities = [...parentGroups, ...standaloneIndividuals];
    topLevelEntities.sort((a, b) => {
      if (sortDirection === 'desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    const q = globalFilter.toLowerCase().trim();

    const matchesFilter = (a: Animal) => {
      if (activeTab !== 'ALL' && a.category !== activeTab) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        (a.species && a.species.toLowerCase().includes(q)) ||
        (a.ring_number && a.ring_number.toLowerCase().includes(q))
      );
    };

    const flattenedRows: AnimalRowData[] = [];

    topLevelEntities.forEach(entity => {
      const isGroup = entity.record_type === 'GROUP';
      const children = isGroup ? (childrenByParent.get(entity.id) || []) : [];
      children.sort((a, b) => {
        if (sortDirection === 'desc') {
          return (b.name || '').localeCompare(a.name || '');
        }
        return (a.name || '').localeCompare(b.name || '');
      });

      const groupMatches = matchesFilter(entity);
      const matchingChildren = children.filter(matchesFilter);
      const hasMatchingChild = matchingChildren.length > 0;

      if (!isGroup) {
        if (groupMatches) {
          flattenedRows.push({
            ...entity,
            isGroupParent: false,
            isChildMember: false,
            feedLogs: feedMap.get(entity.id) || [],
            weightLog: weightStatus.get(entity.id),
            tempLog: tempStatus.get(entity.id),
            mistLog: mistStatus.get(entity.id),
          });
        }
      } else {
        if (groupMatches || hasMatchingChild) {
          const weighedCount = children.filter(c => weightStatus.has(c.id)).length;

          flattenedRows.push({
            ...entity,
            isGroupParent: true,
            isChildMember: false,
            childCount: children.length,
            weighedCount,
            feedLogs: feedMap.get(entity.id) || [],
            weightLog: weightStatus.get(entity.id),
            tempLog: tempStatus.get(entity.id),
            mistLog: mistStatus.get(entity.id),
          });

          if (expandedMobs.has(entity.id)) {
            const visibleChildren = q ? matchingChildren : children;
            visibleChildren.forEach(child => {
              flattenedRows.push({
                ...child,
                isGroupParent: false,
                isChildMember: true,
                parentGroupId: entity.id,
                parentGroupName: entity.name,
                feedLogs: feedMap.get(child.id) || [],
                weightLog: weightStatus.get(child.id),
                tempLog: tempStatus.get(child.id),
                mistLog: mistStatus.get(child.id),
              });
            });
          }
        }
      }
    });

    return flattenedRows;
  }, [animals, activeTab, globalFilter, expandedMobs, feedMap, weightStatus, tempStatus, mistStatus, sortDirection]);

  const categories = useMemo(() => Array.from(new Set(animals.map(a => a.category).filter(Boolean))).sort(), [animals]);
  const tabs = ['ALL', ...categories];

  const showMistColumn = activeTab === 'EXOTIC';

  const rowVirtualizer = useVirtualizer({
    count: tableData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => isMobile ? 180 : 80,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const tableGridCols = showMistColumn 
    ? "minmax(200px, 1.6fr) minmax(130px, 1fr) minmax(130px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr)"
    : "minmax(220px, 2fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(120px, 1fr)";

  const handleToggleSort = () => {
    setSortDirection(prev => {
      if (!prev) return 'asc';
      if (prev === 'asc') return 'desc';
      return null;
    });
  };

  const renderAnimalIdentity = (animal: AnimalRowData) => {
    const isGroup = animal.isGroupParent;
    const isChild = animal.isChildMember;
    const isExpanded = Boolean(isGroup && expandedMobs.has(animal.id));

    if (isGroup) {
      return (
        <div 
          onClick={() => toggleMob(animal.id)}
          className="flex items-center gap-2.5 min-w-0 py-1 cursor-pointer group select-none text-left"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMob(animal.id);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 transition-colors shrink-0 cursor-pointer"
          >
            {isExpanded ? <ChevronDown size={18} className="text-blue-600" /> : <ChevronRight size={18} />}
          </button>
          
          <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center shrink-0 border border-blue-200 bg-blue-100 text-blue-700 shadow-xs overflow-hidden">
            {animal.profile_image_url ? (
              <img src={animal.profile_image_url} alt={animal.name} className="w-full h-full object-cover" />
            ) : (
              <Users size={18} />
            )}
          </div>

          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1.5 flex-wrap text-left">
              <h3 className="font-black text-slate-900 text-xs lg:text-sm tracking-tight truncate group-hover:text-blue-600 transition-colors text-left">
                {animal.name}
              </h3>
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0">
                Mob ({animal.childCount})
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-500 truncate mt-0.5 text-left">
              <span className="italic truncate">{animal.species || 'Colony'}</span>
              {animal.location && <span>&bull; {animal.location}</span>}
            </div>
          </div>
        </div>
      );
    }

    if (isChild) {
      return (
        <div className="flex items-center gap-2.5 min-w-0 py-1 pl-6 lg:pl-8 relative text-left">
          <div className="absolute left-2 lg:left-3 top-1/2 -translate-y-1/2 text-slate-300">
            <CornerDownRight size={14} />
          </div>

          <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center shrink-0 border border-slate-200 bg-slate-50 text-slate-400 shadow-2xs overflow-hidden">
            {animal.profile_image_url ? (
              <img src={animal.profile_image_url} alt={animal.name} className="w-full h-full object-cover" />
            ) : (
              <User size={14} />
            )}
          </div>

          <div className="min-w-0 text-left">
            <h4 className="font-bold text-slate-800 text-xs tracking-tight truncate text-left">
              {animal.name}
            </h4>
            <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-400 truncate text-left">
              {animal.ring_number && <span className="font-mono font-bold">{animal.ring_number}</span>}
              {animal.gender && <span className="uppercase">&bull; {animal.gender}</span>}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 min-w-0 py-1 pl-1 text-left">
        <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center shrink-0 border shadow-xs overflow-hidden ${!animal.profile_image_url ? 'bg-slate-50 text-slate-400 border-slate-200' : 'border-slate-200'}`}>
          {animal.profile_image_url ? (
            <img src={animal.profile_image_url} alt={animal.name} className="w-full h-full object-cover" />
          ) : (
            <User size={16} />
          )}
        </div>

        <div className="min-w-0 text-left">
          <h3 className="font-bold text-slate-900 text-xs lg:text-sm tracking-tight truncate text-left" title={animal.name}>
            {animal.name}
          </h3>
          <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-500 truncate mt-0.5 text-left">
            {animal.ring_number && <span className="font-bold text-slate-400 uppercase tracking-widest">{animal.ring_number}</span>}
            {animal.ring_number && animal.species && <span>&bull;</span>}
            {animal.species && <span className="italic truncate">{animal.species}</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans text-left">
      
      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0 text-left">
        <div className="text-left">
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none text-left">
            Daily Husbandry Logs
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1 text-left">
            Feeds, Weigh-ins, Thermal Gauges &amp; Enclosure Misting
          </p>
        </div>
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0 text-left">
        <div className="relative flex-1 shrink-0 text-left">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Search animals or mobs..." 
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-xs placeholder:text-slate-400 font-medium text-left"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-xs shrink-0 text-left">
          {activeDate !== getLocalDateString() && (
            <button 
              type="button"
              onClick={jumpToToday} 
              className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors border border-emerald-200 cursor-pointer shrink-0"
            >
              <Calendar size={12} /> Today
            </button>
          )}
          <div className="flex items-center justify-between gap-1">
            <button 
              type="button"
              onClick={() => shiftDate(-1)} 
              className="p-1 hover:bg-slate-50 rounded-md text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <input 
              type="date" 
              value={inputDate}
              onChange={(e) => setInputDate(e.target.value)}
              onBlur={(e) => updateDate(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && updateDate(e.currentTarget.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-700 focus:outline-none focus:ring-0 py-0.5 cursor-pointer text-center"
            />
            <button 
              type="button"
              onClick={() => shiftDate(1)} 
              className="p-1 hover:bg-slate-50 rounded-md text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 w-full shrink-0 overflow-x-auto text-left">
        {tabs.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs cursor-pointer ${
              activeTab === tab 
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Virtual Table Canvas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative text-left">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100 text-left">
              <Loader2 className="animate-spin text-slate-800" size={20} />
              <span className="text-xs font-bold text-slate-700 text-left">Loading logs...</span>
            </div>
          </div>
        )}

        <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50/30 text-left">
          {/* Desktop Header */}
          <div className="hidden lg:grid border-b border-slate-200 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-20 backdrop-blur-md text-left" style={{ gridTemplateColumns: tableGridCols }}>
            <div 
              className="px-4 py-2.5 flex items-center gap-1.5 cursor-pointer hover:bg-slate-200/50 transition-colors justify-start text-left"
              onClick={handleToggleSort}
            >
              <span>Animal</span>
              <ArrowUpDown size={11} className={sortDirection ? 'text-slate-900' : 'text-slate-400'} />
            </div>
            <div className="px-4 py-2.5 flex items-center justify-center text-center">Feed Log</div>
            <div className="px-4 py-2.5 flex items-center justify-center text-center">Weight Log</div>
            <div className="px-4 py-2.5 flex items-center justify-center text-center">Temp Log</div>
            {showMistColumn && (
              <div className="px-4 py-2.5 flex items-center justify-center text-center">Mist Log</div>
            )}
          </div>

          <div className="p-2 lg:p-0 text-left">
            {tableData.length === 0 && !isLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <Search size={36} className="opacity-20 mb-2" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-700">No Specimens Found</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
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
                {virtualItems.map(virtualRow => {
                  const row = tableData[virtualRow.index]!;
                  const isChild = row.isChildMember;
                  const isGroup = row.isGroupParent;

                  return (
                    <div 
                      key={row.id} 
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className={`absolute top-0 left-0 w-full grid grid-cols-1 lg:grid border lg:border-none lg:border-b transition-colors gap-2 lg:gap-0 box-border rounded-xl lg:rounded-none p-3 lg:p-0 shadow-2xs lg:shadow-none ${
                        isChild 
                          ? 'bg-slate-50/70 hover:bg-slate-100/70 border-slate-200 lg:border-b-slate-200/80' 
                          : isGroup
                          ? 'bg-blue-50/20 hover:bg-blue-50/40 border-blue-200 lg:border-b-slate-200 font-medium'
                          : 'bg-white hover:bg-slate-50 border-slate-200 lg:border-b-slate-100'
                      }`}
                      style={{ 
                        gridTemplateColumns: isMobile ? '1fr' : tableGridCols,
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      {/* 1. Animal Identity */}
                      <div className="w-full lg:px-4 lg:py-2.5 flex min-w-0 items-center justify-start text-left">
                        {renderAnimalIdentity(row)}
                      </div>

                      {/* 2. Feed Log */}
                      <div className="w-full lg:px-4 lg:py-2.5 flex min-w-0 flex-col lg:items-center lg:justify-center">
                        {isMobile && (
                          <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-center w-full">
                            Feed Log
                          </div>
                        )}
                        <FeedCell 
                          animal={row} 
                          logs={row.feedLogs || []} 
                          isGroupParent={row.isGroupParent}
                          onOpenModal={setFeedModalState} 
                        />
                      </div>

                      {/* 3. Weight Log */}
                      <div className="w-full lg:px-4 lg:py-2.5 flex min-w-0 flex-col lg:items-center lg:justify-center">
                        {isMobile && (
                          <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-center w-full">
                            Weight Log
                          </div>
                        )}
                        <WeightCell 
                          animal={row} 
                          log={row.weightLog} 
                          isGroupParent={row.isGroupParent}
                          childCount={row.childCount}
                          weighedCount={row.weighedCount}
                          isExpanded={Boolean(expandedMobs.has(row.id))}
                          onToggleExpand={() => toggleMob(row.id)}
                          onOpenModal={setWeightModalState} 
                        />
                      </div>

                      {/* 4. Temp Log */}
                      <div className="w-full lg:px-4 lg:py-2.5 flex min-w-0 flex-col lg:items-center lg:justify-center">
                        {isMobile && (
                          <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-center w-full">
                            Temp Log
                          </div>
                        )}
                        <TempCell 
                          animal={row} 
                          log={row.tempLog} 
                          onOpenModal={setTempModalState} 
                        />
                      </div>

                      {/* 5. Mist Log (Conditional) */}
                      {showMistColumn && (
                        <div className="w-full lg:px-4 lg:py-2.5 flex min-w-0 flex-col lg:items-center lg:justify-center">
                          {isMobile && (
                            <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-center w-full">
                              Mist Log
                            </div>
                          )}
                          <MistCell 
                            animal={row} 
                            log={row.mistLog} 
                            activeDate={activeDate} 
                            onOpenModal={setMistModalState} 
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {feedModalState.isOpen && feedModalState.animalId && (
        <FeedModal 
          isOpen={feedModalState.isOpen} 
          animalId={feedModalState.animalId} 
          animal={feedModalState.animal}
          initialData={feedModalState.initialData} 
          selectedDate={activeDate} 
          onClose={() => setFeedModalState({ isOpen: false, animalId: null, animal: null, initialData: undefined })} 
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
          animalId={mistModalState.animal.id} 
          animal={mistModalState.animal} 
          initialData={mistModalState.initialData} 
          selectedDate={activeDate} 
          onClose={() => setMistModalState({ isOpen: false, animal: null, initialData: undefined })} 
        />
      )}
    </div>
  );
}

export default HusbandryLogs;