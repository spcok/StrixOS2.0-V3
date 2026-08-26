import { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as v from 'valibot';
import {
  ShieldAlert,
  Plus,
  X,
  Search,
  Save,
  Loader2,
  Calendar,
  WifiOff,
  Users,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { Animal, User, IsolationLog } from '../../types';

interface EnrichedIsolationLog extends IsolationLog {
  animals?: Partial<Animal> | null;
  users?: { name?: string | null; initials?: string | null } | null;
}

interface IsolationFormValues {
  animal_id: string;
  isolation_type: 'QUARANTINE' | 'MEDICAL_OBSERVATION' | 'BEHAVIORAL_SEPARATION' | 'DIETARY_RESTRICTION';
  start_date: string;
  end_date: string;
  reason: string;
  notes: string;
  authorized_by: string;
}

const IsolationSchema = v.pipe(
  v.object({
    animal_id: v.pipe(v.string(), v.minLength(1, 'Target specimen is required')),
    isolation_type: v.picklist([
      'QUARANTINE',
      'MEDICAL_OBSERVATION',
      'BEHAVIORAL_SEPARATION',
      'DIETARY_RESTRICTION',
    ]),
    start_date: v.pipe(v.string(), v.minLength(1, 'Start date is required')),
    end_date: v.optional(v.string()),
    reason: v.pipe(v.string(), v.minLength(1, 'Primary reason is required')),
    notes: v.optional(v.string()),
    authorized_by: v.optional(v.string()),
  }),
  v.check((data) => {
    if (data.end_date && data.end_date.trim().length > 0 && data.start_date) {
      return data.end_date >= data.start_date;
    }
    return true;
  }, 'Clearance date must be on or after the start date')
);

const extractErrorText = (errors: unknown): string | null => {
  if (!errors) return null;
  const errArray = Array.isArray(errors) ? errors : [errors];
  if (errArray.length === 0) return null;
  const messages = errArray
    .map((e) => {
      if (typeof e === 'string') return e;
      if (
        e &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as { message: unknown }).message === 'string'
      ) {
        return (e as { message: string }).message;
      }
      return null;
    })
    .filter(Boolean);
  return messages.length > 0 ? messages.join(', ') : null;
};

const FieldError = ({ meta }: { meta: { errors?: unknown[] } }) => {
  if (!meta?.errors || meta.errors.length === 0) return null;
  const text = extractErrorText(meta.errors);
  if (!text) return null;
  return <p className="text-[10px] text-rose-500 mt-0.5 font-bold">{text}</p>;
};

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Ongoing';
  const [y, m, d] = dateStr.split('T')[0]!.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const generateOfflineUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS & 14-DAY RETENTION
// ------------------------------------------------------------------
const isolationLogsOptions = queryOptions({
  queryKey: ['isolation_logs'],
  queryFn: async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('isolation_logs')
      .select(`
        *,
        animals ( id, name, species, ring_number, profile_image_url, record_type, location ),
        users:authorized_by ( name, initials )
      `)
      .eq('is_deleted', false)
      .or(`end_date.is.null,start_date.gte.${fourteenDaysAgo}`)
      .order('start_date', { ascending: false });

    if (error) throw error;
    return (data || []) as EnrichedIsolationLog[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true },
});

const activeAnimalsOptions = queryOptions({
  queryKey: ['active_animals'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('animals')
      .select('id, name, species, record_type, location, ring_number')
      .eq('is_deleted', false)
      .order('name');
    if (error) throw error;
    return (data || []) as Animal[];
  },
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true },
});

const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, is_deleted, is_active, role')
      .order('name');
    if (error) throw error;
    return (data || []) as User[];
  },
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true },
});

export const Route = createFileRoute('/clinical/isolation')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(isolationLogsOptions),
      context.queryClient.ensureQueryData(activeAnimalsOptions),
      context.queryClient.ensureQueryData(staffMembersOptions),
    ]);
  },
  component: IsolationLogsPage,
});

function useIsMobile() {
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

export function IsolationLogsPage() {
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();
  const isMobile = useIsMobile();

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'CLEARED' | 'ALL'>('ACTIVE');

  const scrollParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('isolation-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'isolation_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['isolation_logs'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: logs = [], isLoading } = useQuery(isolationLogsOptions);
  const { data: animals = [] } = useQuery(activeAnimalsOptions);
  const { data: staffMembers = [] } = useQuery(staffMembersOptions);

  const filteredLogs = useMemo(() => {
    let filtered = logs;
    if (activeTab === 'ACTIVE') {
      filtered = filtered.filter((l) => !l.end_date);
    } else if (activeTab === 'CLEARED') {
      filtered = filtered.filter((l) => Boolean(l.end_date));
    }

    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          (l.animals?.name || '').toLowerCase().includes(lower) ||
          (l.animals?.ring_number || '').toLowerCase().includes(lower) ||
          (l.reason || '').toLowerCase().includes(lower) ||
          (l.users?.name || '').toLowerCase().includes(lower)
      );
    }
    return filtered;
  }, [logs, searchQuery, activeTab]);

  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => (isMobile ? 180 : 76),
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const completeIsolationMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!isOnline) throw new Error('Must be online to clear isolation status.');
      const { error } = await supabase
        .from('isolation_logs')
        .update({
          end_date: new Date().toISOString(),
          modified_by: user?.id || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs'] });
      toast.success('Quarantine status cleared successfully.');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Action failed';
      toast.error(msg);
    },
  });

  const tableGridCols =
    'minmax(220px, 1.4fr) minmax(260px, 2fr) minmax(180px, 1.2fr) minmax(140px, 1fr)';

  const tabs = [
    { id: 'ACTIVE', label: 'Currently Isolated' },
    { id: 'CLEARED', label: 'Cleared / Released' },
    { id: 'ALL', label: 'All Records' },
  ] as const;

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl shadow-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-rose-900">
            <WifiOff size={18} className="text-rose-600 shrink-0" />
            <div>
              <span className="font-black uppercase tracking-widest text-[10px] text-rose-600 block">
                Clinical Network Disconnected
              </span>
              <span className="text-xs font-bold mt-0.5">
                Biosecurity changes are locked to prevent sync conflicts.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none">
            Quarantine &amp; Isolation
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Biosecurity Tracking &amp; Intake Protocol
          </p>
        </div>

        {hasPermission('clinical:write') && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Plus size={14} className="text-violet-400" />
            <span>Isolate Animal</span>
          </button>
        )}
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search specimen, ring, or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-lg text-teal-800 shadow-xs shrink-0 w-full sm:w-auto">
          <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
          <span className="text-[10px] font-bold leading-tight">14-Day rolling audit window active.</span>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 w-full shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chameleon Data Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100">
              <Loader2 className="animate-spin text-violet-600" size={20} />
              <span className="text-xs font-bold text-slate-700">Syncing biosecurity logs...</span>
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
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Patient &amp; Status</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Reason for Isolation</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Timeframe</div>
            <div className="px-4 py-2.5 flex items-center justify-end text-right">Action</div>
          </div>

          <div className="p-2 lg:p-0">
            {filteredLogs.length === 0 && !isLoading ? (
              <div className="p-8 lg:p-12 text-center text-slate-500 flex flex-col items-center">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-3 border border-slate-200 shadow-xs">
                  <ShieldAlert size={20} className="text-slate-400" />
                </div>
                <p className="font-black text-slate-700 mb-0.5 text-xs tracking-tight">
                  No isolation records found
                </p>
                <p className="text-[10px] font-medium text-slate-400">
                  Try adjusting your search or tab filters.
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
                  const log = filteredLogs[virtualRow.index]!;
                  const isActive = !log.end_date;
                  const isGroup = log.animals?.record_type === 'GROUP';

                  return (
                    <div
                      key={log.id}
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
                            Patient &amp; Status
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 min-w-0 py-0.5 w-full">
                          <div
                            className={`w-8 h-8 lg:w-9 lg:h-9 rounded-full flex items-center justify-center shrink-0 border shadow-xs overflow-hidden ${
                              !log.animals?.profile_image_url
                                ? isGroup
                                  ? 'bg-blue-50 text-blue-600 border-blue-100'
                                  : 'bg-slate-50 text-slate-400 border border-slate-200'
                                : 'border-slate-200'
                            }`}
                          >
                            {log.animals?.profile_image_url ? (
                              <img
                                src={log.animals.profile_image_url}
                                alt={log.animals.name || 'Animal'}
                                className="w-full h-full object-cover"
                              />
                            ) : isGroup ? (
                              <Users size={15} />
                            ) : (
                              <UserIcon size={15} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h3
                                className="font-bold text-slate-900 text-xs lg:text-[13px] tracking-tight truncate"
                                title={log.animals?.name || 'Unknown'}
                              >
                                {log.animals?.name || 'Unknown Specimen'}
                              </h3>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shrink-0 ${
                                  isActive
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {isActive ? 'ACTIVE' : 'CLEARED'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-400 truncate mt-0.5 font-bold">
                              {log.animals?.ring_number && (
                                <span className="uppercase tracking-widest">{log.animals.ring_number}</span>
                              )}
                              {log.animals?.ring_number && log.animals?.species && <span>&bull;</span>}
                              {log.animals?.species && <span className="italic truncate">{log.animals.species}</span>}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Reason Column */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Reason for Isolation
                          </div>
                        )}
                        <div className="space-y-1 w-full pr-2">
                          <div className="flex items-center gap-1.5">
                            <ShieldAlert
                              size={12}
                              className={isActive ? 'text-rose-500 shrink-0' : 'text-slate-400 shrink-0'}
                            />
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shadow-xs">
                              {(log.isolation_type || 'QUARANTINE').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 line-clamp-1">{log.reason}</p>
                          {log.notes && (
                            <p className="text-[10px] font-medium text-slate-500 line-clamp-2 leading-relaxed">
                              {log.notes}
                            </p>
                          )}
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            Auth: {log.users?.name || 'Authorized Staff'}
                          </p>
                        </div>
                      </div>

                      {/* Timeframe Column */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Timeframe
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[9px] lg:text-[10px] font-black text-slate-700 uppercase tracking-widest w-fit">
                            <Calendar size={11} /> Start: {formatDisplayDate(log.start_date)}
                          </span>
                          {log.end_date ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] lg:text-[10px] font-black uppercase tracking-widest w-fit bg-emerald-50 border-emerald-200 text-emerald-700">
                              <CheckCircle2 size={11} /> Cleared: {formatDisplayDate(log.end_date)}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">
                              Indefinite Quarantine
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Column */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'justify-end pt-2 border-t border-slate-100' : 'items-center justify-end'
                        }`}
                      >
                        {isActive ? (
                          hasPermission('clinical:write') && (
                            <button
                              type="button"
                              onClick={() => completeIsolationMutation.mutate(log.id)}
                              disabled={completeIsolationMutation.isPending}
                              className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 active:scale-95 cursor-pointer"
                            >
                              {completeIsolationMutation.isPending && (
                                <Loader2 size={11} className="animate-spin" />
                              )}
                              <span>Clear Quarantine</span>
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Completed
                          </span>
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

      {/* Isolation Entry Modal */}
      {isModalOpen && (
        <IsolationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          animals={animals}
          staffMembers={staffMembers}
          userId={user?.id || ''}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// ISOLATION MODAL SUB-COMPONENT
// ------------------------------------------------------------------
function IsolationModal({
  isOpen,
  onClose,
  animals,
  staffMembers,
  userId,
}: {
  isOpen: boolean;
  onClose: () => void;
  animals: Animal[];
  staffMembers: User[];
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (values: IsolationFormValues) => {
      const result = v.safeParse(IsolationSchema, values);
      if (!result.success) {
        throw new Error(result.issues[0]?.message || 'Validation failed');
      }

      const recordId = generateOfflineUUID();
      const payload: Partial<IsolationLog> = {
        id: recordId,
        animal_id: values.animal_id,
        isolation_type: values.isolation_type,
        start_date: new Date(values.start_date).toISOString(),
        end_date: values.end_date.trim() ? new Date(values.end_date).toISOString() : null,
        reason: values.reason.trim(),
        notes: values.notes.trim() || null,
        authorized_by: values.authorized_by || null,
        is_deleted: false,
        created_by: userId || null,
        modified_by: userId || null,
      };

      const { error } = await supabase.from('isolation_logs').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs'] });
      toast.success('Isolation protocol initiated successfully.');
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save isolation log.';
      setErrorMsg(msg);
      toast.error(msg);
    },
  });

  const form = useForm<IsolationFormValues>({
    defaultValues: {
      animal_id: '',
      isolation_type: 'QUARANTINE',
      start_date: getLocalDateString(),
      end_date: '',
      reason: '',
      notes: '',
      authorized_by: userId || '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(IsolationSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      await saveMutation.mutateAsync(value);
    },
  });

  if (!isOpen) return null;

  const inputClass =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all placeholder:text-slate-400';
  const labelClass = 'text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block';

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white border border-slate-200/80 rounded-3xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden max-h-[92vh]">
        <div className="bg-white border-b border-slate-100 px-5 py-3.5 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
              Initiate Isolation Protocol
            </h2>
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Biosecurity &amp; Intake Directive
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form
          id="isolation-form"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="p-4 sm:p-5 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 bg-white"
        >
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-xs">
              {errorMsg}
            </div>
          )}

          <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl flex items-start gap-2.5">
            <ShieldAlert size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-rose-900 uppercase tracking-tight">
                Biosecurity Directive
              </p>
              <p className="text-[10px] font-medium text-rose-700 mt-0.5 leading-relaxed">
                Initiating this protocol marks the specimen as isolated across all modules and alerts all staff members.
              </p>
            </div>
          </div>

          <form.Field name="animal_id">
            {(field: FieldApi<IsolationFormValues, 'animal_id', any, any>) => (
              <div>
                <label className={labelClass}>Patient Specimen *</label>
                <select
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="" disabled>-- Select Patient Specimen --</option>
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.species || 'Unknown'}) &bull; {a.location || 'Enclosure'}
                    </option>
                  ))}
                </select>
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          <form.Field name="isolation_type">
            {(field: FieldApi<IsolationFormValues, 'isolation_type', any, any>) => (
              <div>
                <label className={labelClass}>Isolation Protocol Type *</label>
                <select
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value as IsolationFormValues['isolation_type']
                    )
                  }
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="QUARANTINE">Full Quarantine (Inbound / Contagion)</option>
                  <option value="MEDICAL_OBSERVATION">Medical Observation</option>
                  <option value="BEHAVIORAL_SEPARATION">Behavioral Separation</option>
                  <option value="DIETARY_RESTRICTION">Dietary Restriction</option>
                </select>
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="start_date">
              {(field: FieldApi<IsolationFormValues, 'start_date', any, any>) => (
                <div>
                  <label className={labelClass}>Start Date *</label>
                  <input
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className={inputClass}
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>

            <form.Field name="end_date">
              {(field: FieldApi<IsolationFormValues, 'end_date', any, any>) => (
                <div>
                  <label className={labelClass}>Target Clearance (Optional)</label>
                  <input
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className={inputClass}
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="reason">
            {(field: FieldApi<IsolationFormValues, 'reason', any, any>) => (
              <div>
                <label className={labelClass}>Primary Reason *</label>
                <input
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. New specimen intake, biosecurity screen"
                  className={inputClass}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field: FieldApi<IsolationFormValues, 'notes', any, any>) => (
              <div>
                <label className={labelClass}>Biosecurity PPE &amp; Restrictions</label>
                <textarea
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="e.g. Foot dip required. Dedicated feeding tongs in isolation airlock."
                />
              </div>
            )}
          </form.Field>

          <form.Field name="authorized_by">
            {(field: FieldApi<IsolationFormValues, 'authorized_by', any, any>) => (
              <div>
                <label className={labelClass}>Authorizing Staff / Clinician</label>
                <select
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">-- Select Authorizing Staff --</option>
                  {staffMembers
                    .filter((s) => !s.is_deleted && s.is_active !== false)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.initials ? `(${s.initials})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </form.Field>
        </form>

        <div className="px-5 py-3.5 border-t border-slate-100 bg-white flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                form="isolation-form"
                disabled={!canSubmit || Boolean(isSubmitting) || saveMutation.isPending}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 flex items-center gap-1.5 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                {isSubmitting || saveMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                <span>Commit Isolation</span>
              </button>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default IsolationLogsPage;