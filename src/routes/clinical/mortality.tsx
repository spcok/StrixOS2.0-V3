import { useState, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Search, 
  Calendar, 
  AlertTriangle, 
  Loader2, 
  BookOpen, 
  Users, 
  User as UserIcon, 
  Skull,
  Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Animal, User } from '../../types';

export interface DeathLog {
  id: string;
  animal_id: string;
  date_of_death: string;
  manner_of_death: 'Died' | 'Euthanasia' | string;
  cause_of_death?: string | null;
  necropsy_notes?: string | null;
  logged_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EnrichedDeathLog extends DeathLog {
  animalDetails?: Partial<Animal> | null;
  loggedByName: string;
}

const formatDisplayDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Unknown Date';
  const dateObj = new Date(dateStr);
  if (Number.isNaN(dateObj.getTime())) return 'Unknown Date';
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDisplayTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '--:--';
  const dateObj = new Date(dateStr);
  if (Number.isNaN(dateObj.getTime())) return '--:--';
  return dateObj.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const deathLogsOptions = queryOptions({
  queryKey: ['death_logs'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('death_logs')
      .select('*')
      .order('date_of_death', { ascending: false });
    if (error) throw error;
    return (data || []) as DeathLog[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true },
});

const allAnimalsOptions = queryOptions({
  queryKey: ['animals', 'all_records'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('animals')
      .select('id, name, species, ring_number, profile_image_url, record_type, location, category');
    if (error) throw error;
    return (data || []) as Animal[];
  },
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true },
});

const staffDirectoryOptions = queryOptions({
  queryKey: ['staff_directory_mortality'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, initials');
    if (error) throw error;
    return (data || []) as User[];
  },
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true },
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION
// ------------------------------------------------------------------
export const Route = createFileRoute('/clinical/mortality')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(deathLogsOptions),
      context.queryClient.ensureQueryData(allAnimalsOptions),
      context.queryClient.ensureQueryData(staffDirectoryOptions),
    ]);
  },
  component: MortalityLedger,
});

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  return isMobile;
}

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function MortalityLedger() {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const scrollParentRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Data
  const { data: deathLogs = [], isLoading: loadingLogs } = useQuery(deathLogsOptions);
  const { data: animals = [], isLoading: loadingAnimals } = useQuery(allAnimalsOptions);
  const { data: staff = [], isLoading: loadingStaff } = useQuery(staffDirectoryOptions);

  const isLoading = loadingLogs || loadingAnimals || loadingStaff;

  // 2. Stitch and Filter Data
  const ledgerData = useMemo<EnrichedDeathLog[]>(() => {
    const animalMap = new Map<string, Animal>();
    animals.forEach((a) => animalMap.set(a.id, a));

    const staffMap = new Map<string, User>();
    staff.forEach((s) => staffMap.set(s.id, s));

    let stitched: EnrichedDeathLog[] = deathLogs.map((log) => {
      const animal = animalMap.get(log.animal_id) || null;
      const logger = log.logged_by ? staffMap.get(log.logged_by) : null;
      return {
        ...log,
        animalDetails: animal,
        loggedByName: logger?.name ? `${logger.name} ${logger.initials ? `(${logger.initials})` : ''}` : 'Authorized Staff',
      };
    });

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      stitched = stitched.filter(
        (row) =>
          (row.animalDetails?.name || '').toLowerCase().includes(query) ||
          (row.animalDetails?.species || '').toLowerCase().includes(query) ||
          (row.animalDetails?.ring_number || '').toLowerCase().includes(query) ||
          (row.cause_of_death || '').toLowerCase().includes(query) ||
          (row.necropsy_notes || '').toLowerCase().includes(query)
      );
    }

    return stitched;
  }, [deathLogs, animals, staff, searchQuery]);

  // 3. Virtualizer Setup
  const rowVirtualizer = useVirtualizer({
    count: ledgerData.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => (isMobile ? 180 : 76),
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const tableGridCols =
    'minmax(240px, 1.6fr) minmax(180px, 1.2fr) minmax(280px, 2fr) minmax(160px, 1fr)';

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none flex items-center gap-2">
            Mortality Ledger
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            ZLA Statutory Post-Mortem &amp; Carcass Disposition Records[cite: 2]
          </p>
        </div>
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search by specimen, ring number, diagnosis, or cause..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Main Data View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100">
              <Loader2 className="animate-spin text-rose-600" size={20} />
              <span className="text-xs font-bold text-slate-700">Syncing mortality ledger...</span>
            </div>
          </div>
        )}

        <div
          ref={scrollParentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50/30"
        >
          {/* Desktop Table Header */}
          <div
            className="hidden lg:grid border-b border-slate-200 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-20 backdrop-blur-md"
            style={{ gridTemplateColumns: tableGridCols }}
          >
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Specimen Details</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Date &amp; Manner</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Cause &amp; Necropsy Notes</div>
            <div className="px-4 py-2.5 flex items-center justify-end text-right">Authorizing Clinician/Staff</div>
          </div>

          <div className="p-2 lg:p-0">
            {ledgerData.length === 0 && !isLoading ? (
              <div className="p-8 lg:p-12 text-center text-slate-500 flex flex-col items-center">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-3 border border-slate-200 shadow-xs">
                  <BookOpen size={20} className="text-slate-400" />
                </div>
                <p className="font-black text-slate-700 mb-0.5 text-xs tracking-tight">Ledger is Empty</p>
                <p className="text-[10px] font-medium text-slate-400">
                  No post-mortem or mortality records found matching this criteria.
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
                  const row = ledgerData[virtualRow.index]!;
                  const animal = row.animalDetails;
                  const isGroup = animal?.record_type === 'GROUP';
                  const isEuthanasia = row.manner_of_death?.toLowerCase() === 'euthanasia';

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
                      {/* Identity Column */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Specimen
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 min-w-0 py-0.5 w-full">
                          <div
                            className={`w-8 h-8 lg:w-9 lg:h-9 rounded-full flex items-center justify-center shrink-0 border shadow-xs overflow-hidden ${
                              !animal?.profile_image_url
                                ? isGroup
                                  ? 'bg-blue-50 text-blue-600 border-blue-100'
                                  : 'bg-slate-50 text-slate-400 border border-slate-200'
                                : 'border-slate-200'
                            }`}
                          >
                            {animal?.profile_image_url ? (
                              <img
                                src={animal.profile_image_url}
                                alt={animal.name || 'Specimen'}
                                className="w-full h-full object-cover"
                              />
                            ) : isGroup ? (
                              <Users size={15} />
                            ) : (
                              <UserIcon size={15} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3
                              className="font-bold text-slate-900 text-xs lg:text-[13px] tracking-tight truncate"
                              title={animal?.name || 'Unknown Specimen'}
                            >
                              {animal?.name || 'Unknown Specimen'}
                            </h3>
                            <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-400 truncate mt-0.5 font-bold">
                              {animal?.ring_number && (
                                <span className="uppercase tracking-widest">{animal.ring_number}</span>
                              )}
                              {animal?.ring_number && animal?.species && <span>&bull;</span>}
                              {animal?.species && <span className="italic truncate">{animal.species}</span>}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Date & Manner Column */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Time &amp; Manner
                          </div>
                        )}
                        <div className="space-y-1 w-full">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[9px] lg:text-[10px] font-black text-slate-700 uppercase tracking-widest w-fit">
                            <Calendar size={11} /> {formatDisplayDate(row.date_of_death)}{' '}
                            <span className="text-slate-400 font-bold ml-0.5">
                              {formatDisplayTime(row.date_of_death)}
                            </span>
                          </span>
                          <span
                            className={`block w-fit text-[8px] lg:text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                              isEuthanasia
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            {row.manner_of_death || 'Deceased'}
                          </span>
                        </div>
                      </div>

                      {/* Cause & Necropsy Notes Column */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col pt-1.5 border-t border-slate-100' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Cause of Death &amp; Findings
                          </div>
                        )}
                        <div className="space-y-0.5 w-full pr-3">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                            <AlertTriangle
                              size={12}
                              className={row.cause_of_death ? 'text-rose-500 shrink-0' : 'text-slate-300 shrink-0'}
                            />
                            <span className="truncate">{row.cause_of_death || 'Pending Post-Mortem Assessment'}</span>
                          </span>
                          {row.necropsy_notes && (
                            <p
                              className="text-[10px] font-medium text-slate-500 line-clamp-2 leading-relaxed"
                              title={row.necropsy_notes}
                            >
                              {row.necropsy_notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Authorizing Clinician / Staff Column */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'justify-between pt-1.5 border-t border-slate-100' : 'items-center justify-end'
                        }`}
                      >
                        {isMobile && (
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            Authorizing Staff
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-700 text-right truncate">
                          {row.loggedByName}
                        </span>
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
  );
}

export default MortalityLedger;