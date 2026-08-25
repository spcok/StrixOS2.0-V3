import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { 
  ShieldCheck, 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Search, 
  Loader2, 
  Utensils, 
  Scale, 
  Droplets, 
  Thermometer, 
  Check, 
  Plus 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Animal, FeedLog, FeedingSchedule, WeightLog, TemperatureLog, MistLog } from '../../types';
import { FeedModal } from '../../components/husbandry/FeedModal';
import { WeightModal } from '../../components/husbandry/WeightModal';
import { TemperatureModal } from '../../components/husbandry/TemperatureModal';
import { MistModal } from '../../components/husbandry/MistModal';

const CATEGORY_TABS = [
  { id: 'OWL', label: 'Owl' },
  { id: 'RAPTOR', label: 'Raptor' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotics' },
] as const;

interface DayStatus {
  date: Date;
  dateStr: string;
  isFutureDay: boolean;
  hasFeed: boolean;
  hasWeight: boolean;
  hasTemp: boolean;
  hasMisting: boolean;
}

interface SpecimenAuditRow {
  animal: Animal;
  requiresTemp: boolean;
  requiresMisting: boolean;
  days: DayStatus[];
  hasWeeklyWeight: boolean;
  animalCompliancePct: number;
  isFullyCompliant: boolean;
}

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfWeek = (d: Date): Date => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getEndOfWeek = (startDate: Date): Date => {
  const date = new Date(startDate);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
};

const getDaysInWeek = (startDate: Date): Date[] => {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
};

const formatShortDate = (d: Date): string => {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const formatDayHeader = (d: Date): string => {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
};

const getAuditDataOptions = (weekStartStr: string, weekEndStr: string) =>
  queryOptions({
    queryKey: ['weekly_compliance_audit', weekStartStr, weekEndStr],
    queryFn: async () => {
      const [animalsRes, feedsRes, schedulesRes, weightsRes, tempsRes, mistsRes] = await Promise.all([
        supabase
          .from('animals')
          .select('*')
          .neq('status', 'ARCHIVED')
          .neq('status', 'DECEASED')
          .order('name', { ascending: true }),
        supabase
          .from('feed_logs')
          .select('*')
          .eq('is_deleted', false)
          .gte('recorded_at', `${weekStartStr}T00:00:00.000Z`)
          .lte('recorded_at', `${weekEndStr}T23:59:59.999Z`),
        supabase
          .from('feeding_schedules')
          .select('*')
          .eq('is_deleted', false)
          .gte('scheduled_date', weekStartStr)
          .lte('scheduled_date', weekEndStr),
        supabase
          .from('weight_logs')
          .select('*')
          .eq('is_deleted', false)
          .gte('recorded_at', `${weekStartStr}T00:00:00.000Z`)
          .lte('recorded_at', `${weekEndStr}T23:59:59.999Z`),
        supabase
          .from('temperature_logs')
          .select('*')
          .eq('is_deleted', false)
          .gte('recorded_at', `${weekStartStr}T00:00:00.000Z`)
          .lte('recorded_at', `${weekEndStr}T23:59:59.999Z`),
        supabase
          .from('mist_logs')
          .select('*')
          .eq('is_deleted', false)
          .gte('recorded_at', `${weekStartStr}T00:00:00.000Z`)
          .lte('recorded_at', `${weekEndStr}T23:59:59.999Z`),
      ]);

      if (animalsRes.error) throw animalsRes.error;

      return {
        animals: (animalsRes.data || []) as Animal[],
        feedLogs: (feedsRes.data || []) as FeedLog[],
        schedules: (schedulesRes.data || []) as FeedingSchedule[],
        weightLogs: (weightsRes.data || []) as WeightLog[],
        temperatureLogs: (tempsRes.data || []) as TemperatureLog[],
        mistLogs: (mistsRes.data || []) as MistLog[],
      };
    },
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

export const Route = createFileRoute('/husbandry/missing-records')({
  loader: async ({ context }) => {
    const start = getStartOfWeek(new Date());
    const end = getEndOfWeek(start);
    await context.queryClient.ensureQueryData(
      getAuditDataOptions(getLocalDateString(start), getLocalDateString(end))
    );
  },
  component: WeeklyComplianceAuditPage,
});

export function WeeklyComplianceAuditPage() {
  const [currentWeekDate, setCurrentWeekDate] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('OWL');

  const [modalState, setModalState] = useState<{
    type: 'FEED' | 'WEIGHT' | 'MISTING' | 'TEMP' | null;
    animal: Animal | null;
    date: string;
  }>({
    type: null,
    animal: null,
    date: getLocalDateString(),
  });

  const weekStart = useMemo(() => getStartOfWeek(currentWeekDate), [currentWeekDate]);
  const weekEnd = useMemo(() => getEndOfWeek(weekStart), [weekStart]);
  const daysInWeek = useMemo(() => getDaysInWeek(weekStart), [weekStart]);

  const weekStartStr = useMemo(() => getLocalDateString(weekStart), [weekStart]);
  const weekEndStr = useMemo(() => getLocalDateString(weekEnd), [weekEnd]);

  const { data, isLoading } = useQuery(getAuditDataOptions(weekStartStr, weekEndStr));

  const { auditMatrix, overallStats } = useMemo(() => {
    if (!data) return { auditMatrix: [], overallStats: { total: 0, compliantCount: 0, compliancePct: 100 } };

    const { animals, feedLogs, schedules, weightLogs, temperatureLogs, mistLogs } = data;
    const todayStr = getLocalDateString();

    const matrix: SpecimenAuditRow[] = animals.map((animal) => {
      const requiresTemp = animal.ambient_temp_only === false || animal.target_day_temp_c !== null || animal.category === 'EXOTIC';
      const requiresMisting = animal.target_humidity_min_percent !== null || animal.category === 'EXOTIC';

      const days: DayStatus[] = daysInWeek.map((day) => {
        const dateStr = getLocalDateString(day);
        const isFutureDay = dateStr > todayStr;

        const feedSched = schedules.find((f) => f.animal_id === animal.id && f.scheduled_date === dateStr);
        const hasFeed = feedSched
          ? feedSched.status === 'COMPLETED' || feedSched.status === 'FASTING'
          : feedLogs.some((l) => l.animal_id === animal.id && l.recorded_at.startsWith(dateStr));

        const hasWeight = weightLogs.some((w) => w.animal_id === animal.id && w.recorded_at.startsWith(dateStr));

        const hasTemp = temperatureLogs.some((t) => t.animal_id === animal.id && t.recorded_at.startsWith(dateStr));

        const hasMisting = mistLogs.some((m) => m.animal_id === animal.id && m.recorded_at.startsWith(dateStr));

        return {
          date: day,
          dateStr,
          isFutureDay,
          hasFeed,
          hasWeight,
          hasTemp,
          hasMisting,
        };
      });

      const pastDays = days.filter((d) => !d.isFutureDay);
      const checksPerDay = 1 + (requiresTemp ? 1 : 0) + (requiresMisting ? 1 : 0);
      const totalChecksRequired = pastDays.length * checksPerDay + 1; // +1 for mandatory weekly weight check

      let checksCompleted = 0;
      pastDays.forEach((d) => {
        if (d.hasFeed) checksCompleted++;
        if (requiresTemp && d.hasTemp) checksCompleted++;
        if (requiresMisting && d.hasMisting) checksCompleted++;
      });
      const hasWeeklyWeight = days.some((d) => d.hasWeight);
      if (hasWeeklyWeight) checksCompleted++;

      const animalCompliancePct = totalChecksRequired > 0 ? Math.round((checksCompleted / totalChecksRequired) * 100) : 100;
      const isFullyCompliant = animalCompliancePct >= 100;

      return {
        animal,
        requiresTemp,
        requiresMisting,
        days,
        hasWeeklyWeight,
        animalCompliancePct,
        isFullyCompliant,
      };
    });

    const compliantCount = matrix.filter((m) => m.isFullyCompliant).length;
    const compliancePct = matrix.length > 0 ? Math.round((compliantCount / matrix.length) * 100) : 100;

    return {
      auditMatrix: matrix,
      overallStats: {
        total: matrix.length,
        compliantCount,
        compliancePct,
      },
    };
  }, [data, daysInWeek]);

  const filteredMatrix = useMemo(() => {
    return auditMatrix.filter((row) => {
      const cat = (row.animal.category || '').toUpperCase();
      const matchesCategory = selectedCategory === 'EXOTIC' ? (cat === 'EXOTIC' || cat === 'EXOTICS') : cat === selectedCategory;

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        row.animal.name.toLowerCase().includes(q) ||
        (row.animal.species || '').toLowerCase().includes(q) ||
        (row.animal.location || '').toLowerCase().includes(q) ||
        (row.animal.ring_number || '').toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [auditMatrix, selectedCategory, searchQuery]);

  const shiftWeek = (weeks: number) => {
    setCurrentWeekDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + weeks * 7);
      return next;
    });
  };

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Header & Week Selector Ribbon */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2 shrink-0">
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-tight flex items-center gap-2">
            Weekly Compliance Matrix
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            Statutory Zoo Licensing Act 7-Day Telemetry &amp; Welfare Audit
          </p>
        </div>

        {/* Week Navigator Controls */}
        <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end shrink-0">
          <div className="flex items-center bg-white rounded-xl p-0.5 border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer active:scale-95"
              title="Previous Week"
            >
              <ChevronLeft size={14} />
            </button>

            <div className="px-2.5 py-0.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800">
              <Calendar size={12} className="text-slate-400" />
              <span>
                {formatShortDate(weekStart)} &ndash; {formatShortDate(weekEnd)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer active:scale-95"
              title="Next Week"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCurrentWeekDate(new Date())}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-xs"
          >
            Current Week
          </button>

          <span
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border shadow-xs ${
              overallStats.compliancePct >= 90
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : overallStats.compliancePct >= 70
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {overallStats.compliancePct}% Audit
          </span>
        </div>
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search specimen, ring, or enclosure..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Category Tabs Ordered: Owl, Raptor, Mammal, Exotics */}
      <div className="grid grid-cols-4 lg:flex lg:gap-1.5 w-full shrink-0 gap-1">
        {CATEGORY_TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-1.5 lg:px-4 py-1.5 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs cursor-pointer ${
              selectedCategory === tab.id
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main 7-Day Compliance Grid */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-0 relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 bg-slate-50/30 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <Loader2 size={24} className="animate-spin text-emerald-600" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-600">
                Compiling 7-Day Statutory Matrix...
              </span>
            </div>
          ) : filteredMatrix.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2 p-8">
              <ShieldCheck size={36} className="text-emerald-500 opacity-80" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">No Specimens Found</h3>
              <p className="text-[10px] text-slate-400 font-medium">
                No specimens match this category or search query.
              </p>
            </div>
          ) : (
            filteredMatrix.map(({ animal, requiresTemp, requiresMisting, days, hasWeeklyWeight, animalCompliancePct }) => (
              <div
                key={animal.id}
                className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-4"
              >
                {/* Animal Specimen Details */}
                <div className="w-full lg:w-60 shrink-0 space-y-1">
                  <div className="flex items-center justify-between lg:justify-start gap-2">
                    <h3 className="text-xs lg:text-sm font-black text-slate-900 tracking-tight">{animal.name}</h3>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-200">
                      {animal.location || 'Enclosure'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold truncate">
                    {animal.species || animal.category} {animal.ring_number ? `• ${animal.ring_number}` : ''}
                  </p>

                  <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                        animalCompliancePct >= 100
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : animalCompliancePct >= 70
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {animalCompliancePct}% Audit Score
                    </span>
                    {requiresTemp && (
                      <span className="text-[9px] font-black text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                        Temp Tracked
                      </span>
                    )}
                    {requiresMisting && (
                      <span className="text-[9px] font-black text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200">
                        Mist Tracked
                      </span>
                    )}
                  </div>
                </div>

                {/* 7-Day Matrix Rows */}
                <div className="w-full flex-1">
                  <div className="w-full space-y-1.5">
                    {/* Day Column Header */}
                    <div className="grid grid-cols-8 gap-1 text-center pb-1 border-b border-slate-100 items-center">
                      <div className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400 text-left truncate">
                        Stream
                      </div>
                      {days.map((d) => (
                        <div key={d.dateStr} className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500">
                          {formatDayHeader(d.date)}
                        </div>
                      ))}
                    </div>

                    {/* Row 1: Diet / Feeding */}
                    <div className="grid grid-cols-8 gap-1 items-center">
                      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-slate-700 min-w-0">
                        <Utensils size={11} className="text-amber-600 shrink-0" />
                        <span className="truncate">Feeding</span>
                      </div>
                      {days.map((d) => (
                        <button
                          type="button"
                          key={d.dateStr}
                          disabled={d.isFutureDay}
                          onClick={() => setModalState({ type: 'FEED', animal, date: d.dateStr })}
                          className={`w-full py-1 min-h-[26px] sm:min-h-[28px] rounded-lg text-[8px] sm:text-[10px] font-black transition-all flex items-center justify-center border cursor-pointer ${
                            d.isFutureDay
                              ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50'
                              : d.hasFeed
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                              : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 border-dashed active:scale-95'
                          }`}
                          title={d.hasFeed ? `Diet recorded on ${d.dateStr}` : `Log feeding for ${d.dateStr}`}
                        >
                          {d.hasFeed ? (
                            <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          ) : d.isFutureDay ? (
                            '-'
                          ) : (
                            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Row 2: Weight Verification */}
                    <div className="grid grid-cols-8 gap-1 items-center">
                      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-slate-700 min-w-0">
                        <Scale size={11} className="text-emerald-600 shrink-0" />
                        <span className="truncate">Weight</span>
                      </div>
                      {days.map((d) => (
                        <button
                          type="button"
                          key={d.dateStr}
                          disabled={d.isFutureDay}
                          onClick={() => setModalState({ type: 'WEIGHT', animal, date: d.dateStr })}
                          className={`w-full py-1 min-h-[26px] sm:min-h-[28px] rounded-lg text-[8px] sm:text-[10px] font-black transition-all flex items-center justify-center border cursor-pointer ${
                            d.isFutureDay
                              ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50'
                              : d.hasWeight
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                              : hasWeeklyWeight
                              ? 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200 active:scale-95'
                              : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 border-dashed active:scale-95'
                          }`}
                          title={d.hasWeight ? `Weight recorded on ${d.dateStr}` : `Record weight on ${d.dateStr}`}
                        >
                          {d.hasWeight ? (
                            <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          ) : d.isFutureDay ? (
                            '-'
                          ) : (
                            <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Row 3: Temperature */}
                    {requiresTemp && (
                      <div className="grid grid-cols-8 gap-1 items-center">
                        <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-slate-700 min-w-0">
                          <Thermometer size={11} className="text-purple-600 shrink-0" />
                          <span className="truncate">Temp</span>
                        </div>
                        {days.map((d) => (
                          <button
                            type="button"
                            key={d.dateStr}
                            disabled={d.isFutureDay}
                            onClick={() => setModalState({ type: 'TEMP', animal, date: d.dateStr })}
                            className={`w-full py-1 min-h-[26px] sm:min-h-[28px] rounded-lg text-[8px] sm:text-[10px] font-black transition-all flex items-center justify-center border cursor-pointer ${
                              d.isFutureDay
                                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50'
                                : d.hasTemp
                                ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                                : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 border-dashed active:scale-95'
                            }`}
                            title={d.hasTemp ? `Temp recorded on ${d.dateStr}` : `Log temp check on ${d.dateStr}`}
                          >
                            {d.hasTemp ? (
                              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            ) : d.isFutureDay ? (
                              '-'
                            ) : (
                              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Row 4: Misting */}
                    {requiresMisting && (
                      <div className="grid grid-cols-8 gap-1 items-center">
                        <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-slate-700 min-w-0">
                          <Droplets size={11} className="text-cyan-600 shrink-0" />
                          <span className="truncate">Misting</span>
                        </div>
                        {days.map((d) => (
                          <button
                            type="button"
                            key={d.dateStr}
                            disabled={d.isFutureDay}
                            onClick={() => setModalState({ type: 'MISTING', animal, date: d.dateStr })}
                            className={`w-full py-1 min-h-[26px] sm:min-h-[28px] rounded-lg text-[8px] sm:text-[10px] font-black transition-all flex items-center justify-center border cursor-pointer ${
                              d.isFutureDay
                                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50'
                                : d.hasMisting
                                ? 'bg-cyan-600 text-white border-cyan-700 shadow-xs'
                                : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 border-dashed active:scale-95'
                            }`}
                            title={d.hasMisting ? `Misting recorded on ${d.dateStr}` : `Log misting for ${d.dateStr}`}
                          >
                            {d.hasMisting ? (
                              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            ) : d.isFutureDay ? (
                              '-'
                            ) : (
                              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Telemetry Modals */}
      {modalState.animal && (
        <>
          {modalState.type === 'FEED' && (
            <FeedModal
              isOpen={true}
              onClose={() => setModalState({ type: null, animal: null, date: '' })}
              animalId={modalState.animal.id}
              selectedDate={modalState.date}
            />
          )}

          {modalState.type === 'WEIGHT' && (
            <WeightModal
              isOpen={true}
              onClose={() => setModalState({ type: null, animal: null, date: '' })}
              animalId={modalState.animal.id}
              selectedDate={modalState.date}
            />
          )}

          {modalState.type === 'TEMP' && (
            <TemperatureModal
              isOpen={true}
              onClose={() => setModalState({ type: null, animal: null, date: '' })}
              animal={modalState.animal}
              animalId={modalState.animal.id}
              selectedDate={modalState.date}
            />
          )}

          {modalState.type === 'MISTING' && (
            <MistModal
              isOpen={true}
              onClose={() => setModalState({ type: null, animal: null, date: '' })}
              animal={modalState.animal}
              animalId={modalState.animal.id}
              selectedDate={modalState.date}
            />
          )}
        </>
      )}
    </div>
  );
}

export default WeeklyComplianceAuditPage;