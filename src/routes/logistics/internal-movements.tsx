import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  MapPin, 
  Plus, 
  Calendar, 
  ArrowRight, 
  Search, 
  Loader2, 
  X, 
  ShieldCheck,
  Trash2,
  Users,
  User as UserIcon,
  ArrowLeftRight
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { InternalMovement, Animal } from '../../types';

interface EnrichedInternalMovement extends InternalMovement {
  animals?: Partial<Animal> | Partial<Animal>[] | null;
}

const CATEGORY_TABS = [
  { id: 'ALL', label: 'All Categories' },
  { id: 'OWL', label: 'Owl' },
  { id: 'RAPTOR', label: 'Raptor' },
  { id: 'MAMMAL', label: 'Mammal' },
  { id: 'EXOTIC', label: 'Exotics' },
] as const;

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

// ------------------------------------------------------------------
// 1. STRICT QUERY OPTIONS
// ------------------------------------------------------------------
const internalMovementsOptions = queryOptions({
  queryKey: ['internal_movements'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('internal_movements')
      .select('*, animals ( id, name, species, ring_number, record_type, profile_image_url, category, location )')
      .eq('is_deleted', false)
      .order('movement_date', { ascending: false });

    if (error) throw error;
    return (data || []) as EnrichedInternalMovement[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
  meta: { persist: true },
});

const animalsListOptions = queryOptions({
  queryKey: ['animals_select_list'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('animals')
      .select('id, name, species, ring_number, location, category, profile_image_url, record_type')
      .neq('status', 'ARCHIVED')
      .neq('status', 'DECEASED')
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
export const Route = createFileRoute('/logistics/internal-movements')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(internalMovementsOptions),
      context.queryClient.ensureQueryData(animalsListOptions),
    ]);
  },
  component: InternalMovementsPage,
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
export function InternalMovementsPage() {
  const queryClient = useQueryClient();
  const { user, profile, hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const isAuthorized =
    hasPermission('transfers:write') ||
    ['ADMIN', 'DIRECTOR', 'MANAGER', 'SENIOR_KEEPER'].includes(profile?.role || '');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const [form, setForm] = useState({
    animal_id: '',
    movement_date: getLocalDateString(),
    from_enclosure: '',
    to_enclosure: '',
    reason: '',
    authorized_by: profile?.name || user?.email || '',
  });

  // Real-time synchronization
  useEffect(() => {
    const channel = supabase
      .channel('internal-movements-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_movements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['internal_movements'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: movements = [], isLoading } = useQuery(internalMovementsOptions);
  const { data: animals = [] } = useQuery(animalsListOptions);

  // Soft Delete Action
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('internal_movements')
        .update({
          is_deleted: true,
          modified_by: user?.id || profile?.id || null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Movement record removed from active ledger.');
      queryClient.invalidateQueries({ queryKey: ['internal_movements'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      toast.error(msg);
    },
  });

  const createMovementMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const movementId = generateOfflineUUID();

      const { data, error } = await supabase
        .from('internal_movements')
        .insert([
          {
            id: movementId,
            animal_id: payload.animal_id,
            movement_date: new Date(payload.movement_date).toISOString(),
            from_location: payload.from_enclosure.trim() || null,
            to_location: payload.to_enclosure.trim(),
            reason: payload.reason.trim() || null,
            authorized_by: payload.authorized_by.trim(),
            created_by: user?.id || profile?.id || null,
            modified_by: user?.id || profile?.id || null,
            is_deleted: false,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Automatically update the specimen's active enclosure location
      const { error: animalUpdateError } = await supabase
        .from('animals')
        .update({
          location: payload.to_enclosure.trim(),
          modified_by: user?.id || profile?.id || null,
        })
        .eq('id', payload.animal_id);

      if (animalUpdateError) {
        console.warn('[InternalMovements] Animal location update warning:', animalUpdateError.message);
      }

      return data;
    },
    onSuccess: () => {
      toast.success('Internal movement recorded and specimen location updated.');
      queryClient.invalidateQueries({ queryKey: ['internal_movements'] });
      queryClient.invalidateQueries({ queryKey: ['animals'] });
      queryClient.invalidateQueries({ queryKey: ['animals_select_list'] });
      setIsModalOpen(false);
      setForm({
        animal_id: '',
        movement_date: getLocalDateString(),
        from_enclosure: '',
        to_enclosure: '',
        reason: '',
        authorized_by: profile?.name || user?.email || '',
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to record movement';
      toast.error(msg);
    },
  });

  const handleAnimalSelect = (animalId: string) => {
    const selected = animals.find((a) => a.id === animalId);
    setForm((prev) => ({
      ...prev,
      animal_id: animalId,
      from_enclosure: selected?.location || '',
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.animal_id || !form.to_enclosure.trim()) {
      toast.error('Please select a specimen and enter a destination enclosure.');
      return;
    }
    createMovementMutation.mutate(form);
  };

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const animalObj = Array.isArray(m.animals) ? m.animals[0] : m.animals;
      const cat = (animalObj?.category || '').toUpperCase();

      const matchesCategory =
        selectedCategory === 'ALL'
          ? true
          : selectedCategory === 'EXOTIC'
          ? cat === 'EXOTIC' || cat === 'EXOTICS'
          : cat === selectedCategory;

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        (animalObj?.name || '').toLowerCase().includes(q) ||
        (animalObj?.species || '').toLowerCase().includes(q) ||
        (animalObj?.ring_number || '').toLowerCase().includes(q) ||
        (m.from_location || m.from_enclosure || '').toLowerCase().includes(q) ||
        (m.to_location || m.to_enclosure || '').toLowerCase().includes(q) ||
        (m.reason || '').toLowerCase().includes(q) ||
        (m.authorized_by || '').toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [movements, selectedCategory, searchQuery]);

  // Virtualizer Setup
  const rowVirtualizer = useVirtualizer({
    count: filteredMovements.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => (isMobile ? 180 : 76),
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const tableGridCols =
    'minmax(220px, 1.5fr) minmax(130px, 1fr) minmax(220px, 1.5fr) minmax(200px, 1.4fr) minmax(60px, 0.4fr)';

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none flex items-center gap-2">
            Internal Movements
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Statutory Zoo Licensing Act (ZLA) On-Site Relocation Ledger[cite: 1]
          </p>
        </div>

        {isAuthorized && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Plus size={14} className="text-emerald-400" />
            <span>Record Movement</span>
          </button>
        )}
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0">
        <div className="relative flex-1 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search specimen, enclosure route, reason, staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 w-full shrink-0 overflow-x-auto">
        {CATEGORY_TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs cursor-pointer ${
              selectedCategory === tab.id
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
              <span className="text-xs font-bold text-slate-700">Syncing internal movements...</span>
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
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Date</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Relocation Route</div>
            <div className="px-4 py-2.5 flex items-center justify-start text-left">Reason &amp; Authorizer</div>
            <div className="px-4 py-2.5 flex items-center justify-end text-right">Actions</div>
          </div>

          <div className="p-2 lg:p-0">
            {filteredMovements.length === 0 && !isLoading ? (
              <div className="p-8 lg:p-12 text-center text-slate-500 flex flex-col items-center">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-3 border border-slate-200 shadow-xs">
                  <ShieldCheck size={20} className="text-slate-400" />
                </div>
                <p className="font-black text-slate-700 mb-0.5 text-xs tracking-tight">
                  No Movement Records Found
                </p>
                <p className="text-[10px] font-medium text-slate-400">
                  Try adjusting your search criteria or category filter.
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
                  const m = filteredMovements[virtualRow.index]!;
                  const animalObj = Array.isArray(m.animals) ? m.animals[0] : m.animals;
                  const isGroup = animalObj?.record_type === 'GROUP';
                  const fromLoc = m.from_location || m.from_enclosure || 'Unassigned';
                  const toLoc = m.to_location || m.to_enclosure || '-';

                  return (
                    <div
                      key={m.id}
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
                              title={animalObj?.name || 'Unknown Specimen'}
                            >
                              {animalObj?.name || 'Unknown Specimen'}
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

                      {/* 2. Date */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Movement Date
                          </div>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[9px] lg:text-[10px] font-black text-slate-700 uppercase tracking-widest w-fit">
                          <Calendar size={11} /> {formatDisplayDate(m.movement_date)}
                        </span>
                      </div>

                      {/* 3. Relocation Route */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Relocation Route
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs font-bold min-w-0 pr-2">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 truncate max-w-[120px]">
                            {fromLoc}
                          </span>
                          <ArrowRight size={11} className="text-slate-400 shrink-0" />
                          <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 truncate max-w-[120px]">
                            {toLoc}
                          </span>
                        </div>
                      </div>

                      {/* 4. Reason & Authorizer */}
                      <div
                        className={`w-full lg:px-4 lg:py-2.5 flex min-w-0 ${
                          isMobile ? 'flex-col' : 'items-center justify-start'
                        }`}
                      >
                        {isMobile && (
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Reason &amp; Authorizer
                          </div>
                        )}
                        <div className="space-y-0.5 w-full pr-2">
                          <p className="text-xs font-bold text-slate-900 line-clamp-1">
                            {m.reason || 'Routine Enclosure Transfer'}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            Auth: {m.authorized_by || 'Staff Lead'}
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
                              if (window.confirm('Archive this internal movement record?[cite: 1]')) {
                                deleteMutation.mutate(m.id!);
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

      {/* Record Movement Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-white border border-slate-200/80 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-black shadow-xs shrink-0">
                  <MapPin size={16} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none">
                    Record Internal Movement
                  </h3>
                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    On-Site Enclosure Transfer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto custom-scrollbar space-y-3.5 text-xs font-medium bg-white flex-1">
              <div>
                <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Target Specimen *
                </label>
                <select
                  required
                  value={form.animal_id}
                  onChange={(e) => handleAnimalSelect(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                >
                  <option value="" disabled>-- Choose Target Specimen --</option>
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.species || a.category}) {a.location ? `[Current: ${a.location}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Movement Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.movement_date}
                    onChange={(e) => setForm({ ...form, movement_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Authorizing Staff *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.authorized_by}
                    onChange={(e) => setForm({ ...form, authorized_by: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Origin Enclosure
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aviary 4"
                    value={form.from_enclosure}
                    onChange={(e) => setForm({ ...form, from_enclosure: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Destination Enclosure *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Flight Barn 2"
                    value={form.to_enclosure}
                    onChange={(e) => setForm({ ...form, to_enclosure: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Reason for Relocation
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Scheduled breeding season pairing, display rotation, enclosure maintenance..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMovementMutation.isPending}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  {createMovementMutation.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : null}
                  <span>Save Movement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default InternalMovementsPage;