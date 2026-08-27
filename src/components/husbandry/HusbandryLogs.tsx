import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ClipboardList, 
  Loader2, 
  AlertCircle, 
  Utensils, 
  Scale, 
  Thermometer, 
  Droplets,
  Calendar,
  Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Animal, FeedLog, WeightLog, TemperatureLog, MistLog, User } from '../../types';
export interface HusbandryLogsProps {
  animalId: string;
  weightUnit?: string;
  animal?: Animal | null;
}

type LogTypeFilter = 'ALL' | 'FEEDING' | 'WEIGHT' | 'TEMP' | 'MIST';

interface UnifiedTimelineItem {
  id: string;
  type: 'FEEDING' | 'WEIGHT' | 'TEMP' | 'MIST';
  timestamp: number;
  dateObj: Date;
  data: any;
}

const GRAMS_PER_OZ = 28.349523125;

const formatWeightDisplay = (
  grams: number | null | undefined,
  unit: string | null | undefined
): string => {
  if (grams === null || grams === undefined) return '--';
  const numGrams = Number(grams);
  if (Number.isNaN(numGrams)) return '--';

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

const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function HusbandryLogs({ animalId, weightUnit = 'g', animal }: HusbandryLogsProps) {
  const [endDate, setEndDate] = useState<string>(() => getLocalDateString(new Date()));
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });

  const [logFilter, setLogFilter] = useState<LogTypeFilter>('ALL');

  const preferredUnit = animal?.weight_unit || weightUnit || 'g';

  // 1. Staff Lookup Query for Keeper Attribution
  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ['active-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials')
        .eq('is_deleted', false);
      if (error) throw error;
      return (data || []) as User[];
    },
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  const staffMap = useMemo(() => {
    const map = new Map<string, string>();
    staffList.forEach((s) => {
      map.set(s.id, s.initials || s.name || s.id.substring(0, 8));
    });
    return map;
  }, [staffList]);

  // 2. Feed Logs Query
  const { data: feeds = [], isLoading: loadingFeeds, error: feedsError } = useQuery<FeedLog[]>({
    queryKey: ['feed_logs', animalId, startDate, endDate],
    queryFn: async () => {
      const start = `${startDate}T00:00:00.000Z`;
      const end = `${endDate}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('feed_logs')
        .select('*')
        .eq('animal_id', animalId)
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as FeedLog[];
    },
    enabled: Boolean(animalId),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // 3. Weight Logs Query
  const { data: weights = [], isLoading: loadingWeights, error: weightsError } = useQuery<WeightLog[]>({
    queryKey: ['weight_logs', animalId, startDate, endDate],
    queryFn: async () => {
      const start = `${startDate}T00:00:00.000Z`;
      const end = `${endDate}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('animal_id', animalId)
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as WeightLog[];
    },
    enabled: Boolean(animalId),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // 4. Temperature Logs Query
  const { data: temps = [], isLoading: loadingTemps, error: tempsError } = useQuery<TemperatureLog[]>({
    queryKey: ['temperature_logs', animalId, startDate, endDate],
    queryFn: async () => {
      const start = `${startDate}T00:00:00.000Z`;
      const end = `${endDate}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('temperature_logs')
        .select('*')
        .eq('animal_id', animalId)
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as TemperatureLog[];
    },
    enabled: Boolean(animalId),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // 5. Misting Logs Query
  const { data: mists = [], isLoading: loadingMists, error: mistsError } = useQuery<MistLog[]>({
    queryKey: ['mist_logs', animalId, startDate, endDate],
    queryFn: async () => {
      const start = `${startDate}T00:00:00.000Z`;
      const end = `${endDate}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('mist_logs')
        .select('*')
        .eq('animal_id', animalId)
        .eq('is_deleted', false)
        .gte('recorded_at', start)
        .lte('recorded_at', end)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MistLog[];
    },
    enabled: Boolean(animalId),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

  // Unified Multi-Telemetry Timeline Matrix
  const unifiedTimeline = useMemo<UnifiedTimelineItem[]>(() => {
    const combined: UnifiedTimelineItem[] = [];

    if (logFilter === 'ALL' || logFilter === 'FEEDING') {
      feeds.forEach((f) => {
        const d = new Date(f.recorded_at);
        combined.push({
          id: `feed_${f.id || Math.random()}`,
          type: 'FEEDING',
          timestamp: d.getTime(),
          dateObj: d,
          data: f,
        });
      });
    }

    if (logFilter === 'ALL' || logFilter === 'WEIGHT') {
      weights.forEach((w) => {
        const d = new Date(w.recorded_at);
        combined.push({
          id: `weight_${w.id || Math.random()}`,
          type: 'WEIGHT',
          timestamp: d.getTime(),
          dateObj: d,
          data: w,
        });
      });
    }

    if (logFilter === 'ALL' || logFilter === 'TEMP') {
      temps.forEach((t) => {
        const d = new Date(t.recorded_at);
        combined.push({
          id: `temp_${t.id || Math.random()}`,
          type: 'TEMP',
          timestamp: d.getTime(),
          dateObj: d,
          data: t,
        });
      });
    }

    if (logFilter === 'ALL' || logFilter === 'MIST') {
      mists.forEach((m) => {
        const d = new Date(m.recorded_at);
        combined.push({
          id: `mist_${m.id || Math.random()}`,
          type: 'MIST',
          timestamp: d.getTime(),
          dateObj: d,
          data: m,
        });
      });
    }

    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [feeds, weights, temps, mists, logFilter]);

  const isLoading = loadingFeeds || loadingWeights || loadingTemps || loadingMists;
  const hasError = feedsError || weightsError || tempsError || mistsError;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-6 font-sans">
      {/* Filter and Date Ribbon */}
      <div className="flex flex-col sm:flex-row gap-3 items-end bg-slate-50/80 p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex gap-2 w-full sm:w-auto items-center">
          <div className="flex-1 sm:w-36">
            <label htmlFor="husbandry-log-start-date" className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Calendar size={11} /> From
            </label>
            <input
              id="husbandry-log-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs"
            />
          </div>
          <div className="flex-1 sm:w-36">
            <label htmlFor="husbandry-log-end-date" className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Calendar size={11} /> To
            </label>
            <input
              id="husbandry-log-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs"
            />
          </div>
        </div>

        <div className="w-full sm:w-48 sm:ml-auto">
          <label htmlFor="husbandry-log-type-filter" className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Filter size={11} /> Telemetry Stream
          </label>
          <select
            id="husbandry-log-type-filter"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value as LogTypeFilter)}
            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs cursor-pointer"
          >
            <option value="ALL">All Telemetry Streams</option>
            <option value="FEEDING">Diet &amp; Nutrition</option>
            <option value="WEIGHT">Biometric Weight</option>
            <option value="TEMP">Thermal &amp; Environment</option>
            <option value="MIST">Misting Routine</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-emerald-500 w-7 h-7" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">
            Compiling Telemetry Ledger...
          </span>
        </div>
      ) : hasError ? (
        <div className="flex flex-col items-center justify-center py-16 text-rose-500 gap-3">
          <AlertCircle size={28} />
          <span className="text-xs font-black uppercase tracking-widest">
            Failed to fetch telemetry streams.
          </span>
        </div>
      ) : unifiedTimeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <ClipboardList size={30} className="opacity-40" />
          <p className="text-[10px] font-black uppercase tracking-widest mt-1 text-slate-500">
            No telemetry logs found within this window.
          </p>
        </div>
      ) : (
        /* Telemetry Table Ledger */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
                  <th className="px-3 py-3 whitespace-nowrap">Stream</th>
                  <th className="px-4 py-3 min-w-[220px]">Telemetry Data</th>
                  <th className="px-3 py-3 whitespace-nowrap">Keeper</th>
                  <th className="px-4 py-3 min-w-[200px]">Observations / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {unifiedTimeline.map((item) => {
                  const dateStr = item.dateObj.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  const timeStr = item.dateObj.toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  let typeBadge = null;
                  let details = null;
                  const keeper = staffMap.get(item.data.recorded_by) || item.data.recorded_by?.substring(0, 6) || '--';

                  if (item.type === 'FEEDING') {
                    typeBadge = (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        <Utensils size={10} /> Feed
                      </span>
                    );
                    const qty = item.data.quantity
                      ? `${item.data.quantity}${item.data.unit === 'grams' || item.data.unit === 'g' ? 'g' : 'x'} `
                      : '';
                    const feedMethod = item.data.feed_method ? ` (${item.data.feed_method})` : '';
                    const calciDust = item.data.calci_dust_added ? ' • +CalciDust' : '';
                    details = (
                      <span className="font-bold text-slate-800">
                        {qty}
                        {item.data.food_item || 'Standard Diet'}
                        <span className="text-[10px] text-slate-500 font-semibold">{feedMethod}{calciDust}</span>
                      </span>
                    );
                  } else if (item.type === 'WEIGHT') {
                    typeBadge = (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <Scale size={10} /> Weight
                      </span>
                    );
                    const castInfo = item.data.has_cast ? ' • Cast Confirmed' : '';
                    details = (
                      <span className="font-black text-emerald-600">
                        {formatWeightDisplay(item.data.weight_grams, preferredUnit)}
                        <span className="text-[10px] text-slate-500 font-semibold ml-1.5">
                          [{item.data.am_pm || 'LOG'}{castInfo}]
                        </span>
                      </span>
                    );
                  } else if (item.type === 'TEMP') {
                    typeBadge = (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        <Thermometer size={10} /> Env
                      </span>
                    );
                    const tempDisplay = item.data.temp_ambient
                      ? `Amb: ${item.data.temp_ambient}°C`
                      : `Basking: ${item.data.temp_basking ?? '--'}°C | Cool: ${item.data.temp_cool ?? '--'}°C`;
                    const humDisplay = item.data.humidity_percent ? ` • Hum: ${item.data.humidity_percent}%` : '';
                    details = (
                      <span className="font-bold text-slate-800">
                        {tempDisplay}
                        <span className="text-cyan-600 font-bold text-[11px]">{humDisplay}</span>
                      </span>
                    );
                  } else if (item.type === 'MIST') {
                    typeBadge = (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200">
                        <Droplets size={10} /> Mist
                      </span>
                    );
                    details = (
                      <span className="font-bold text-cyan-900">
                        {item.data.mist_level || 'MEDIUM'} SATURATION
                        <span className="text-[10px] text-slate-500 font-semibold ml-1.5">
                          [{item.data.am_pm || 'ROUTINE'}]
                        </span>
                      </span>
                    );
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-900 block">{dateStr}</span>
                        <span className="text-[10px] font-bold text-slate-400">{timeStr}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{typeBadge}</td>
                      <td className="px-4 py-2.5">{details}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {keeper}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {item.data.notes ? (
                          <span className="text-xs font-medium text-slate-600 italic">
                            &ldquo;{item.data.notes}&rdquo;
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                            --
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}