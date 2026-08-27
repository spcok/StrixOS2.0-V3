import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as v from 'valibot';
import { 
  ArrowRightLeft, 
  Plus, 
  Calendar, 
  Search, 
  Loader2, 
  X, 
  ShieldCheck,
  MapPin,
  Trash2,
  Users,
  User as UserIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Save,
  Truck,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { ExternalTransfer, Animal } from '../../types';

interface EnrichedExternalTransfer extends ExternalTransfer {
  animals?: Partial<Animal> | Partial<Animal>[] | null;
}

const TRANSFER_TYPES = [
  { id: 'ALL', label: 'All Transfers' },
  { id: 'ACQUISITION', label: 'Acquisitions (IN)' },
  { id: 'DISPOSITION', label: 'Dispositions (OUT)' },
  { id: 'LOAN_OUT', label: 'Loaned Out' },
  { id: 'LOAN_IN', label: 'Loaned In' },
  { id: 'RELEASE', label: 'Releases' },
] as const;

type TransferTypeEnum = 'ACQUISITION' | 'DISPOSITION' | 'LOAN_OUT' | 'LOAN_IN' | 'RELEASE';

interface TransferFormValues {
  animal_id: string;
  transfer_type: TransferTypeEnum;
  transfer_date: string;
  entity_name: string;
  entity_contact: string;
  reason: string;
  transport_details: string;
  authorized_by: string;
}

const TransferSchema = v.object({
  animal_id: v.optional(v.string()),
  transfer_type: v.picklist(['ACQUISITION', 'DISPOSITION', 'LOAN_OUT', 'LOAN_IN', 'RELEASE']),
  transfer_date: v.pipe(v.string(), v.minLength(1, 'Transfer date is required')),
  entity_name: v.pipe(v.string(), v.minLength(1, 'Institution / entity name is required')),
  entity_contact: v.optional(v.string()),
  reason: v.optional(v.string()),
  transport_details: v.optional(v.string()),
  authorized_by: v.pipe(v.string(), v.minLength(1, 'Authorizing staff name is required')),
});

const getLocalDateString = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '--';
  const clean = dateStr.split('T')[0]!;
  const [y, m, d] = clean.split('-').map(Number);
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

// ------------------------------------------------------------------
// 1. STRICT QUERY OPTIONS
// ------------------------------------------------------------------
const getExternalTransfersOptions = (startDate: string, endDate: string) =>
  queryOptions({
    queryKey: ['external_transfers', startDate, endDate],
    queryFn: async () => {
      const startISO = `${startDate}T00:00:00.000Z`;
      const endISO = `${endDate}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from('external_transfers')
        .select(`
          *,
          animals (
            id,
            name,
            species,
            ring_number,
            microchip_id,
            profile_image_url,
            record_type,
            category,
            location
          )
        `)
        .eq('is_deleted', false)
        .gte('transfer_date', startISO)
        .lte('transfer_date', endISO)
        .order('transfer_date', { ascending: false });

      if (error) throw error;
      return (data || []) as EnrichedExternalTransfer[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

const animalsSelectListOptions = queryOptions({
  queryKey: ['animals_transfer_select_list'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('animals')
      .select('id, name, species, ring_number, category, status, profile_image_url, record_type')
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []) as Animal[];
  },
  staleTime: 1000 * 60 * 10,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
});

// ------------------------------------------------------------------
// 2. ROUTE DEFINITION
// ------------------------------------------------------------------
export const Route = createFileRoute('/logistics/external-transfers')({
  loader: async ({ context }) => {
    const today = getLocalDateString(new Date());
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const thirtyDaysAgo = getLocalDateString(d);

    await Promise.all([
      context.queryClient.ensureQueryData(getExternalTransfersOptions(thirtyDaysAgo, today)),
      context.queryClient.ensureQueryData(animalsSelectListOptions),
    ]);
  },
  component: ExternalTransfersPage,
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

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function ExternalTransfersPage() {
  const queryClient = useQueryClient();
  const { user, profile, hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const isAuthorized =
    hasPermission('transfers:approve') ||
    ['ADMIN', 'DIRECTOR', 'MANAGER'].includes(profile?.role || '');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // 30-day default window
  const [endDate, setEndDate] = useState<string>(() => getLocalDateString(new Date()));
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });

  // Real-time synchronization
  useEffect(() => {
    const channel = supabase
      .channel('external-transfers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_transfers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['external_transfers'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: transfers = [], isLoading } = useQuery(getExternalTransfersOptions(startDate, endDate));
  const { data: animals = [] } = useQuery(animalsSelectListOptions);

  // Soft Delete Action
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('external_transfers')
        .update({
          is_deleted: true,
          modified_by: user?.id || profile?.id || null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Transfer record archived from active ledger.');
      queryClient.invalidateQueries({ queryKey: ['external_transfers'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      toast.error(msg);
    },
  });

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const matchesType = selectedType === 'ALL' || t.transfer_type === selectedType;
      const animalObj = Array.isArray(t.animals) ? t.animals[0] : t.animals;
      const q = searchQuery.toLowerCase();

      const matchesSearch =
        !q ||
        (t.entity_name || '').toLowerCase().includes(q) ||
        (animalObj?.name || '').toLowerCase().includes(q) ||
        (animalObj?.species || '').toLowerCase().includes(q) ||
        (animalObj?.ring_number || '').toLowerCase().includes(q) ||
        (t.reason || '').toLowerCase().includes(q) ||
        (t.authorized_by || '').toLowerCase().includes(q) ||
        (t.transport_details || '').toLowerCase().includes(q);

      return matchesType && matchesSearch;
    });
  }, [transfers, selectedType, searchQuery]);

  // Virtualizer Setup
  const rowVirtualizer = useVirtualizer({
    count: filteredTransfers.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => (isMobile ? 180 : 76),
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const tableGridCols =
    'minmax(230px, 1.5fr) minmax(140px, 1fr) minmax(230px, 1.5fr) minmax(210px, 1.4fr) minmax(60px, 0.4fr)';

  const getTransferBadge = (type: string) => {
    switch (type) {
      case 'ACQUISITION':
      case 'LOAN_IN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-emerald-50 border border-emerald-200 text-emerald-700">
            <ArrowDownLeft size={11} className="text-emerald-600 shrink-0" />
            {type.replace(/_/g, ' ')}
          </span>
        );
      case 'DISPOSITION':
      case 'LOAN_OUT':
      case 'RELEASE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-amber-50 border border-amber-200 text-amber-700">
            <ArrowUpRight size={11} className="text-amber-600 shrink-0" />
            {type.replace(/_/g, ' ')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-slate-100 border border-slate-200 text-slate-700">
            <ArrowRightLeft size={11} className="text-slate-500 shrink-0" />
            {type.replace(/_/g, ' ')}
          </span>
        );
    }
  };

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none flex items-center gap-2">
            External Transfers
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Statutory Zoo Licensing Act (ZLA) Section 9 Acquisitions, Loans &amp; Dispositions[cite: 5]
          </p>
        </div>

        {isAuthorized && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Plus size={14} className="text-emerald-400" />
            <span>Record Transfer</span>
          </button>
        )}
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search institution, specimen, ring ID, or terms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-xs w-full sm:w-auto">
            <div className="flex items-center gap-1.5 px-2 py-0.5 border-r border-slate-100">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-none focus:ring-0 py-0.5 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-none focus:ring-0 py-0.5 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 w-full shrink-0 overflow-x-auto">
        {TRANSFER_TYPES.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setSelectedType(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs cursor-pointer ${
              selectedType === tab.id
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Data Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100">
              <Loader2 className="animate-spin text-emerald-600" size={20} />
              <span className="text-xs font-bold text-slate-700">Syncing external transfers...</span>
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
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Type</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Entity / Destination</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Date &amp; Reason</div>
            <div className="px-4 py-2.5 flex items-center justify-end text-right">Actions</div>
          </div>

          <div className="p-2 lg:p-0">
            {filteredTransfers.length === 0 && !isLoading ? (
              <div className="p-8 lg:p-12 text-center text-slate-500 flex flex-col items-center">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-3 border border-slate-200 shadow-xs">
                  <ShieldCheck size={20} className="text-slate-400" />
                </div>
                <p className="font-black text-slate-700 mb-0.5 text-xs tracking-tight">
                  No External Transfers Found
                </p>
                <p className="text-[10px] font-medium text-slate-400">
                  Try adjusting your date range, search terms, or transfer type filter.
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
                  const t = filteredTransfers[virtualRow.index]!;
                  const animalObj = Array.isArray(t.animals) ? t.animals[0] : t.animals;
                  const isGroup = animalObj?.record_type === 'GROUP';

                  return (
                    <div
                      key={t.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute top-0 left-0 w-full grid grid-cols-1 lg:grid border border-slate-200 lg:border-none lg:border-b border-b-slate-100 rounded-xl lg:rounded-none bg-white p-2.5 lg:p-0 hover:bg-slate-50/80 transition-colors shadow-xs lg:shadow-none gap-2 lg:gap-0 box-border mb-2 lg:mb-0"
                      style={{
                        gridTemplateColumns: isMobile ? '1fr' : tableGridCols,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {/* 1. Identity Block */}
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
                              !animalObj?.profile_image_url
                                ? isGroup
                                  ? 'bg-blue-50 text-blue-600 border-blue-100'
                                  : 'bg-slate-50 text-slate-400 border border-slate-200'
                                : 'border-slate-200'
                            }`}
                          >
                            {animalObj?.profile_image_url ? (
                              <img
                                src={animalObj.profile_image_url}
                                alt={animalObj.name || 'Specimen'}
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
                              title={animalObj?.name || 'General Batch'}
                            >
                              {animalObj?.name || 'General / Mob Cohort'}
                            </h3>
                            <div className="flex items-center gap-1.5 text-[9px] lg:text-[10px] text-slate-400 truncate mt-0.5 font-bold">
                              {animalObj?.ring_number && (
                                <span className="uppercase tracking-widest">{animalObj.ring_number}</span>
                              )}
                              {animalObj?.ring_number && animalObj?.species && <span>&bull;</span>}
                              {animalObj?.species && (
                                <span className="italic truncate">{animalObj.species}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 2. Transfer Type Badge */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Transfer Type
                          </div>
                        )}
                        <div>{getTransferBadge(t.transfer_type)}</div>
                      </div>

                      {/* 3. Entity / Destination */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Entity / Destination
                          </div>
                        )}
                        <div className="space-y-0.5 w-full pr-2">
                          <div className="flex items-center gap-1 text-xs font-bold text-slate-800 truncate">
                            <Building2 size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate">{t.entity_name}</span>
                          </div>
                          {t.entity_contact && (
                            <p className="text-[9px] text-slate-400 truncate font-medium">
                              {t.entity_contact}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 4. Date & Reason */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Date &amp; Terms
                          </div>
                        )}
                        <div className="space-y-0.5 w-full pr-2">
                          <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-700 uppercase tracking-widest">
                            <Calendar size={10} className="text-slate-400" />
                            {formatDisplayDate(t.transfer_date)}
                          </span>
                          <p className="text-xs font-bold text-slate-900 line-clamp-1">
                            {t.reason || 'ZLA Regulatory Movement'}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            Auth: {t.authorized_by || 'Director'}
                          </p>
                        </div>
                      </div>

                      {/* 5. Actions */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'justify-end pt-1.5 border-t border-slate-100' : 'items-center justify-end'
                        }`}
                      >
                        {(hasPermission('transfers:delete') || hasPermission('logistics:delete') || isAuthorized) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Archive this external transfer record?')) {
                                deleteMutation.mutate(t.id!);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Archive Record"
                          >
                            {deleteMutation.isPending ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
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

      {/* Record External Transfer Modal */}
      {isModalOpen && (
        <ExternalTransferModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          animals={animals}
          authorizerName={profile?.name || user?.email || 'Authorized Staff'}
          userId={user?.id || ''}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// RECORD TRANSFER MODAL SUB-COMPONENT
// ------------------------------------------------------------------
function ExternalTransferModal({
  isOpen,
  onClose,
  animals,
  authorizerName,
  userId,
}: {
  isOpen: boolean;
  onClose: () => void;
  animals: Animal[];
  authorizerName: string;
  userId: string;
}) {
  const queryClient = useQueryClient();

  const createTransferMutation = useMutation({
    mutationFn: async (values: TransferFormValues) => {
      const result = v.safeParse(TransferSchema, values);
      if (!result.success) {
        throw new Error(result.issues[0]?.message || 'Validation failed');
      }

      const transferId = generateOfflineUUID();

      const { data, error } = await supabase
        .from('external_transfers')
        .insert([
          {
            id: transferId,
            animal_id: values.animal_id || null,
            transfer_type: values.transfer_type,
            transfer_date: new Date(values.transfer_date).toISOString(),
            entity_name: values.entity_name.trim(),
            entity_contact: values.entity_contact.trim() || null,
            reason: values.reason.trim() || null,
            transport_details: values.transport_details.trim() || null,
            authorized_by: values.authorized_by.trim(),
            created_by: userId || null,
            modified_by: userId || null,
            is_deleted: false,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Update specimen collection status dynamically
      if (values.animal_id) {
        let newStatus = 'ACTIVE';
        if (values.transfer_type === 'DISPOSITION') newStatus = 'TRANSFERRED';
        if (values.transfer_type === 'LOAN_OUT') newStatus = 'OFF_SITE';
        if (values.transfer_type === 'RELEASE') newStatus = 'ARCHIVED';

        await supabase
          .from('animals')
          .update({ status: newStatus, modified_by: userId || null })
          .eq('id', values.animal_id);
      }

      return data;
    },
    onSuccess: () => {
      toast.success('External transfer recorded and specimen status synchronized.');
      queryClient.invalidateQueries({ queryKey: ['external_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['animals'] });
      queryClient.invalidateQueries({ queryKey: ['animals_transfer_select_list'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to record transfer';
      toast.error(msg);
    },
  });

  const form = useForm<TransferFormValues>({
    defaultValues: {
      animal_id: '',
      transfer_type: 'ACQUISITION',
      transfer_date: getLocalDateString(),
      entity_name: '',
      entity_contact: '',
      reason: '',
      transport_details: '',
      authorized_by: authorizerName,
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(TransferSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await createTransferMutation.mutateAsync(value);
    },
  });

  if (!isOpen) return null;

  const inputClass =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400';
  const labelClass = 'text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block';

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-black shadow-xs shrink-0">
              <ArrowRightLeft size={16} />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                Record External Transfer
              </h3>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                ZLA Section 9 Acquisition / Disposition[cite: 5]
              </p>
            </div>
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
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="p-4 sm:p-5 overflow-y-auto custom-scrollbar space-y-3.5 text-xs font-medium bg-white flex-1"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <form.Field name="transfer_type">
              {(field: FieldApi<TransferFormValues, 'transfer_type', any, any>) => (
                <div>
                  <label className={labelClass}>Transfer Category *</label>
                  <select
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as TransferTypeEnum)
                    }
                    className={`${inputClass} cursor-pointer`}
                  >
                    <option value="ACQUISITION">Acquisition (Inbound)</option>
                    <option value="DISPOSITION">Disposition (Outbound)</option>
                    <option value="LOAN_OUT">Breeding Loan (Out)</option>
                    <option value="LOAN_IN">Breeding Loan (In)</option>
                    <option value="RELEASE">Wild / Sanctuary Release</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="transfer_date">
              {(field: FieldApi<TransferFormValues, 'transfer_date', any, any>) => (
                <div>
                  <label className={labelClass}>Transfer Date *</label>
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

          <form.Field name="animal_id">
            {(field: FieldApi<TransferFormValues, 'animal_id', any, any>) => (
              <div>
                <label className={labelClass}>
                  Transferred Specimen (Optional for general cohorts)
                </label>
                <select
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">-- General / Unspecified Specimen Cohort --</option>
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.species || a.category}) {a.ring_number ? `[${a.ring_number}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <form.Field name="entity_name">
              {(field: FieldApi<TransferFormValues, 'entity_name', any, any>) => (
                <div>
                  <label className={labelClass}>Institution / Entity Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Chester Zoo"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className={inputClass}
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>

            <form.Field name="authorized_by">
              {(field: FieldApi<TransferFormValues, 'authorized_by', any, any>) => (
                <div>
                  <label className={labelClass}>Authorizing Officer *</label>
                  <input
                    type="text"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className={inputClass}
                  />
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="entity_contact">
            {(field: FieldApi<TransferFormValues, 'entity_contact', any, any>) => (
              <div>
                <label className={labelClass}>Entity Contact Info (Email / Phone / Curator)</label>
                <input
                  type="text"
                  placeholder="e.g. curator@chesterzoo.org / +44 1244 380280"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="transport_details">
            {(field: FieldApi<TransferFormValues, 'transport_details', any, any>) => (
              <div>
                <label className={labelClass}>Transport &amp; Vehicle Carrier Details</label>
                <input
                  type="text"
                  placeholder="e.g. Dedicated climate-controlled van, Type 1 DEFRA authorization"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="reason">
            {(field: FieldApi<TransferFormValues, 'reason', any, any>) => (
              <div>
                <label className={labelClass}>Reason &amp; Statutory Terms</label>
                <textarea
                  rows={2}
                  placeholder="e.g. European Endangered Species Programme (EEP) breeding loan..."
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </div>
            )}
          </form.Field>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <button
                  type="submit"
                  disabled={!canSubmit || Boolean(isSubmitting) || createTransferMutation.isPending}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  {createTransferMutation.isPending || isSubmitting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Save size={13} />
                  )}
                  <span>Save Transfer</span>
                </button>
              )}
            />
          </div>
        </form>
      </div>
    </div>
  );
}

export default ExternalTransfersPage;