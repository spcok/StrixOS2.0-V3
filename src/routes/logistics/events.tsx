import { useState, useMemo, useRef, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Sparkles, 
  Plus, 
  Search, 
  Loader2, 
  X, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  CreditCard, 
  Calendar as CalIcon,
  Trash2,
  Users,
  Feather,
  Phone,
  Lock,
  Ticket,
  CalendarCheck,
  Check,
  AlertTriangle,
  Receipt,
  Pencil
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { 
  EventsCalendar, 
  EventCommercial, 
  EventStaffAllocation, 
  EventAnimalAllocation,
  Animal, 
  UserProfile, 
  Voucher 
} from '../../types';

interface FullEventEntry extends EventsCalendar {
  commercials?: EventCommercial | null;
  staff_allocations?: (EventStaffAllocation & { users?: Partial<UserProfile> | null })[];
  animal_allocations?: (EventAnimalAllocation & { animals?: Partial<Animal> | null })[];
}

const EVENT_TABS = [
  { id: 'ALL', label: 'All Scheduled' },
  { id: 'WEDDING', label: 'Weddings' },
  { id: 'SCHOOL_TALK', label: 'School Talks' },
  { id: 'PARTY', label: 'Parties' },
  { id: 'EXPERIENCE', label: 'Experience Bookings' },
  { id: 'OTHER', label: 'Other Displays' },
  { id: 'VOUCHER_DIRECTORY', label: 'Purchased Vouchers' },
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
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const formatDisplayTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '--:--';
  if (dateStr.length === 5 && dateStr.includes(':')) return dateStr;
  const dateObj = new Date(dateStr);
  if (Number.isNaN(dateObj.getTime())) return dateStr;
  return dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const extractTimeInput = (isoOrTime: string | null | undefined): string => {
  if (!isoOrTime) return '';
  if (isoOrTime.length === 5 && isoOrTime.includes(':')) return isoOrTime;
  const d = new Date(isoOrTime);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const extractDateInput = (isoOrDate: string | null | undefined): string => {
  if (!isoOrDate) return '';
  if (isoOrDate.length === 10 && isoOrDate.includes('-')) return isoOrDate;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return getLocalDateString(d);
};

// ------------------------------------------------------------------
// 1. QUERY OPTIONS
// ------------------------------------------------------------------
const eventsLedgerOptions = queryOptions({
  queryKey: ['events_ledger_management'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('events_calendar')
      .select(`
        *,
        commercials:event_commercials (*),
        staff_allocations:event_staff_allocations (
          *,
          users:user_id (id, name, initials, role)
        ),
        animal_allocations:events_animals (
          *,
          animals (id, name, species, ring_number, profile_image_url)
        )
      `)
      .eq('is_deleted', false)
      .order('start_time', { ascending: false });

    if (error) throw error;
    return (data || []) as FullEventEntry[];
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 14,
  networkMode: 'offlineFirst',
});

const allVouchersDirectoryOptions = queryOptions({
  queryKey: ['all_vouchers_directory'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('vouchers')
      .select('*')
      .order('purchase_date', { ascending: false });
    if (error) throw error;
    return (data || []) as Voucher[];
  },
  staleTime: 1000 * 60 * 5,
});

const animalsListOptions = queryOptions({
  queryKey: ['animals_event_select'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('animals')
      .select('id, name, species, ring_number, location, profile_image_url')
      .eq('status', 'ACTIVE')
      .order('name');
    if (error) throw error;
    return (data || []) as Animal[];
  },
  staleTime: 1000 * 60 * 15,
});

const staffListOptions = queryOptions({
  queryKey: ['staff_event_select'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, initials, role')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data || []) as UserProfile[];
  },
  staleTime: 1000 * 60 * 15,
});

// ------------------------------------------------------------------
// 2. ROUTE DEFINITION
// ------------------------------------------------------------------
export const Route = createFileRoute('/logistics/events')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(eventsLedgerOptions),
      context.queryClient.ensureQueryData(allVouchersDirectoryOptions),
      context.queryClient.ensureQueryData(animalsListOptions),
      context.queryClient.ensureQueryData(staffListOptions),
    ]);
  },
  component: EventsManagerPage,
});

export function EventsManagerPage() {
  const queryClient = useQueryClient();
  const { user, profile, hasPermission } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const isManager =
    hasPermission('events:manage') ||
    ['DIRECTOR', 'ADMIN', 'MANAGER'].includes(profile?.role || '');

  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [voucherFilterStatus, setVoucherFilterStatus] = useState<string>('UNBOOKED');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [animalSearchQuery, setAnimalSearchQuery] = useState<string>('');
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');

  const { data: events = [], isLoading } = useQuery(eventsLedgerOptions);
  const { data: vouchers = [], isLoading: loadingVouchers } = useQuery(allVouchersDirectoryOptions);
  const { data: animals = [] } = useQuery(animalsListOptions);
  const { data: staffList = [] } = useQuery(staffListOptions);

  const defaultFormState = {
    title: '',
    event_type: 'WEDDING' as EventsCalendar['event_type'],
    description: '',
    start_date: getLocalDateString(),
    start_time: '12:00',
    end_time: '14:00',
    venue_address: 'Kent Life, Lock Lane, Maidstone ME14 3AU',
    wedding_ring_delivery_only: false,
    wedding_flying_participant: '',
    rehearsal_time: '',
    rehearsal_at_centre_date: getLocalDateString(),
    rehearsal_at_centre_time: '',
    school_talk_curriculum: '',
    party_type: '',
    site_contact_name: '',
    site_contact_phone: '',
    voucher_id: '',
    client_full_name: '',
    client_email: '',
    client_billing_address: '',
    payment_status: 'UNPAID',
    total_amount: 0,
    deposit_amount: 0,
    deposit_due_date: '',
    balance_due_date: '',
    xero_invoice_number: '',
    billing_notes: '',
    selected_staff_ids: [] as string[],
    selected_animals: [] as { animal_id: string; role_description: string }[],
  };

  const [form, setForm] = useState(defaultFormState);

  const openCreateModal = () => {
    setEditingEventId(null);
    setForm(defaultFormState);
    setIsModalOpen(true);
  };

  const openEditEvent = (event: FullEventEntry) => {
    setEditingEventId(event.id);
    const comm = event.commercials;

    setForm({
      title: event.title,
      event_type: event.event_type as EventsCalendar['event_type'],
      description: event.description || '',
      start_date: extractDateInput(event.start_time) || getLocalDateString(),
      start_time: extractTimeInput(event.start_time) || '12:00',
      end_time: extractTimeInput(event.end_time) || '14:00',
      venue_address: event.venue_address || 'Kent Life, Lock Lane, Maidstone ME14 3AU',
      wedding_ring_delivery_only: Boolean(event.wedding_ring_delivery_only),
      wedding_flying_participant: event.wedding_flying_participant || '',
      rehearsal_time: extractTimeInput(event.rehearsal_time),
      rehearsal_at_centre_date: extractDateInput(event.rehearsal_at_centre_date) || '',
      rehearsal_at_centre_time: extractTimeInput(event.rehearsal_at_centre_time) || '',
      school_talk_curriculum: event.school_talk_curriculum || '',
      party_type: event.party_type || '',
      site_contact_name: event.site_contact_name || '',
      site_contact_phone: event.site_contact_phone || '',
      voucher_id: event.voucher_id || '',
      client_full_name: comm?.client_full_name || event.site_contact_name || '',
      client_email: comm?.client_email || '',
      client_billing_address: comm?.client_billing_address || '',
      payment_status: comm?.payment_status || 'UNPAID',
      total_amount: Number(comm?.total_amount || 0),
      deposit_amount: Number(comm?.deposit_amount || 0),
      deposit_due_date: comm?.deposit_due_date || '',
      balance_due_date: comm?.balance_due_date || '',
      xero_invoice_number: comm?.xero_invoice_number || '',
      billing_notes: comm?.billing_notes || '',
      selected_staff_ids: (event.staff_allocations || []).map(s => s.user_id),
      selected_animals: (event.animal_allocations || []).map(a => ({
        animal_id: a.animal_id,
        role_description: a.role_description || 'Flying / Display Specimen',
      })),
    });
    setIsModalOpen(true);
  };

  const openBookingForVoucher = (voucher: Voucher) => {
    setEditingEventId(null);
    setForm({
      ...defaultFormState,
      title: `${voucher.item_name || voucher.experience_type || 'Experience'} - ${voucher.purchaser_name}`,
      event_type: 'EXPERIENCE',
      description: `Participants: ${voucher.participants}, Guests: ${voucher.guests}. Voucher Code: ${voucher.voucher_code}`,
      start_date: getLocalDateString(),
      start_time: '10:00',
      end_time: '12:00',
      venue_address: 'Kent Owl Academy, Kent Life, Lock Lane, Maidstone ME14 3AU',
      site_contact_name: voucher.purchaser_name,
      voucher_id: voucher.id,
      client_full_name: voucher.purchaser_name,
      client_email: voucher.purchaser_email,
      payment_status: 'PAID_IN_FULL',
      xero_invoice_number: voucher.transaction_id || '',
      billing_notes: `Pre-paid voucher purchase. Code: ${voucher.voucher_code}`,
    });
    setIsModalOpen(true);
  };

  const saveEventMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const startDateTime = new Date(`${payload.start_date}T${payload.start_time}:00`).toISOString();
      const endDateTime = new Date(`${payload.start_date}T${payload.end_time}:00`).toISOString();
      
      const rehearsalDateTime = (payload.event_type === 'WEDDING' && payload.rehearsal_time)
        ? new Date(`${payload.start_date}T${payload.rehearsal_time}:00`).toISOString()
        : null;

      const rehearsalCentreDate = payload.event_type === 'WEDDING' ? (payload.rehearsal_at_centre_date || null) : null;
      const rehearsalCentreTime = payload.event_type === 'WEDDING' ? (payload.rehearsal_at_centre_time || null) : null;

      let targetEventId = editingEventId;

      if (editingEventId) {
        // UPDATE EXISTING EVENT
        const { error: eventUpdateError } = await supabase
          .from('events_calendar')
          .update({
            title: payload.title.trim(),
            event_type: payload.event_type,
            description: payload.description.trim() || null,
            start_time: startDateTime,
            end_time: endDateTime,
            rehearsal_time: rehearsalDateTime,
            rehearsal_at_centre_date: rehearsalCentreDate,
            rehearsal_at_centre_time: rehearsalCentreTime,
            venue_address: payload.venue_address.trim(),
            wedding_ring_delivery_only: payload.event_type === 'WEDDING' ? payload.wedding_ring_delivery_only : false,
            wedding_flying_participant: payload.event_type === 'WEDDING' ? (payload.wedding_flying_participant.trim() || null) : null,
            school_talk_curriculum: payload.event_type === 'SCHOOL_TALK' ? (payload.school_talk_curriculum.trim() || null) : null,
            party_type: payload.event_type === 'PARTY' ? (payload.party_type.trim() || null) : null,
            site_contact_name: payload.site_contact_name.trim(),
            site_contact_phone: payload.site_contact_phone.trim() || null,
            voucher_id: payload.voucher_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEventId);

        if (eventUpdateError) throw eventUpdateError;

        const { error: commUpsertError } = await supabase
          .from('event_commercials')
          .upsert({
            event_id: editingEventId,
            client_full_name: payload.client_full_name.trim() || payload.site_contact_name.trim(),
            client_email: payload.client_email.trim() || null,
            client_billing_address: payload.client_billing_address.trim() || null,
            payment_status: payload.payment_status,
            total_amount: payload.total_amount || 0,
            deposit_amount: payload.deposit_amount || 0,
            deposit_due_date: payload.deposit_due_date || null,
            balance_due_date: payload.balance_due_date || null,
            xero_invoice_number: payload.xero_invoice_number.trim() || null,
            billing_notes: payload.billing_notes.trim() || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'event_id' });

        if (commUpsertError) throw commUpsertError;

        await supabase.from('event_staff_allocations').delete().eq('event_id', editingEventId);
        if (payload.selected_staff_ids.length > 0) {
          const staffInserts = payload.selected_staff_ids.map(uId => ({
            event_id: editingEventId,
            user_id: uId,
            created_by: user?.id || profile?.id || null,
          }));
          await supabase.from('event_staff_allocations').insert(staffInserts);
        }

        await supabase.from('events_animals').delete().eq('event_id', editingEventId);
        if (payload.selected_animals.length > 0) {
          const animalInserts = payload.selected_animals.map(item => ({
            event_id: editingEventId,
            animal_id: item.animal_id,
            role_description: item.role_description.trim() || 'Flying / Display Specimen',
            created_by: user?.id || profile?.id || null,
          }));
          await supabase.from('events_animals').insert(animalInserts);
        }
      } else {
        // INSERT NEW EVENT
        const { data: eventData, error: eventError } = await supabase
          .from('events_calendar')
          .insert([{
            title: payload.title.trim(),
            event_type: payload.event_type,
            description: payload.description.trim() || null,
            start_time: startDateTime,
            end_time: endDateTime,
            rehearsal_time: rehearsalDateTime,
            rehearsal_at_centre_date: rehearsalCentreDate,
            rehearsal_at_centre_time: rehearsalCentreTime,
            venue_address: payload.venue_address.trim(),
            wedding_ring_delivery_only: payload.event_type === 'WEDDING' ? payload.wedding_ring_delivery_only : false,
            wedding_flying_participant: payload.event_type === 'WEDDING' ? (payload.wedding_flying_participant.trim() || null) : null,
            school_talk_curriculum: payload.event_type === 'SCHOOL_TALK' ? (payload.school_talk_curriculum.trim() || null) : null,
            party_type: payload.event_type === 'PARTY' ? (payload.party_type.trim() || null) : null,
            site_contact_name: payload.site_contact_name.trim(),
            site_contact_phone: payload.site_contact_phone.trim() || null,
            voucher_id: payload.voucher_id || null,
            created_by: user?.id || profile?.id || null,
            is_deleted: false,
          }])
          .select()
          .single();

        if (eventError) throw eventError;
        targetEventId = eventData.id;

        const { error: commError } = await supabase
          .from('event_commercials')
          .insert([{
            event_id: eventData.id,
            client_full_name: payload.client_full_name.trim() || payload.site_contact_name.trim(),
            client_email: payload.client_email.trim() || null,
            client_billing_address: payload.client_billing_address.trim() || null,
            payment_status: payload.payment_status,
            total_amount: payload.total_amount || 0,
            deposit_amount: payload.deposit_amount || 0,
            deposit_due_date: payload.deposit_due_date || null,
            balance_due_date: payload.balance_due_date || null,
            xero_invoice_number: payload.xero_invoice_number.trim() || null,
            billing_notes: payload.billing_notes.trim() || null,
            created_by: user?.id || profile?.id || null,
          }]);

        if (commError) throw commError;

        if (payload.selected_staff_ids.length > 0) {
          const staffInserts = payload.selected_staff_ids.map(uId => ({
            event_id: eventData.id,
            user_id: uId,
            created_by: user?.id || profile?.id || null,
          }));
          await supabase.from('event_staff_allocations').insert(staffInserts);
        }

        if (payload.selected_animals.length > 0) {
          const animalInserts = payload.selected_animals.map(item => ({
            event_id: eventData.id,
            animal_id: item.animal_id,
            role_description: item.role_description.trim() || 'Flying / Display Specimen',
            created_by: user?.id || profile?.id || null,
          }));
          await supabase.from('events_animals').insert(animalInserts);
        }
      }

      if (payload.voucher_id) {
        await supabase
          .from('vouchers')
          .update({ 
            booked_in_at: startDateTime,
            booking_notes: `Scheduled for ${payload.start_date} at ${payload.start_time}`
          })
          .eq('id', payload.voucher_id);
      }

      return targetEventId;
    },
    onSuccess: () => {
      toast.success(editingEventId ? 'Event updated successfully.' : 'Event registered successfully.');
      queryClient.invalidateQueries({ queryKey: ['events_ledger_management'] });
      queryClient.invalidateQueries({ queryKey: ['operational_calendar'] });
      queryClient.invalidateQueries({ queryKey: ['all_vouchers_directory'] });
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
      setIsModalOpen(false);
      setEditingEventId(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      toast.error(msg);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('events_calendar')
        .update({ 
          is_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Database accepted update but modified 0 rows. Verify RLS policies on events_calendar.');
      }

      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData(['events_ledger_management'], (old: FullEventEntry[] | undefined) => {
        if (!old) return [];
        return old.filter(e => e.id !== deletedId);
      });
      queryClient.invalidateQueries({ queryKey: ['events_ledger_management'] });
      queryClient.invalidateQueries({ queryKey: ['operational_calendar'] });
      queryClient.invalidateQueries({ queryKey: ['all_vouchers_directory'] });
      toast.success('Event archived successfully.');
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      toast.error(msg);
      setDeleteTarget(null);
    }
  });

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesTab = activeTab === 'ALL' || e.event_type === activeTab;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.site_contact_name.toLowerCase().includes(q) ||
        (e.venue_address || '').toLowerCase().includes(q) ||
        (e.commercials?.client_full_name || '').toLowerCase().includes(q) ||
        (e.commercials?.xero_invoice_number || '').toLowerCase().includes(q);

      return matchesTab && matchesSearch;
    });
  }, [events, activeTab, searchQuery]);

  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      let matchesStatus = true;
      if (voucherFilterStatus === 'UNBOOKED') {
        matchesStatus = v.status === 'ACTIVE' && !v.booked_in_at;
      } else if (voucherFilterStatus === 'BOOKED') {
        matchesStatus = Boolean(v.booked_in_at);
      } else if (voucherFilterStatus !== 'ALL') {
        matchesStatus = v.status === voucherFilterStatus;
      }

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        v.purchaser_name.toLowerCase().includes(q) ||
        v.purchaser_email.toLowerCase().includes(q) ||
        v.voucher_code.toLowerCase().includes(q) ||
        (v.item_name || '').toLowerCase().includes(q) ||
        (v.experience_type || '').toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [vouchers, voucherFilterStatus, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: activeTab === 'VOUCHER_DIRECTORY' ? filteredVouchers.length : filteredEvents.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 150,
    overscan: 4,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const getPaymentBadge = (status?: string | null) => {
    switch (status) {
      case 'PAID_IN_FULL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0">
            <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
            PAID IN FULL
          </span>
        );
      case 'DEPOSIT_PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
            <Clock size={11} className="text-amber-600 shrink-0" />
            DEPOSIT PAID
          </span>
        );
      case 'UNPAID':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-rose-50 border border-rose-200 text-rose-700 shrink-0">
            <AlertCircle size={11} className="text-rose-600 shrink-0" />
            UNPAID
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-slate-100 border border-slate-200 text-slate-600 shrink-0">
            N/A
          </span>
        );
    }
  };

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans text-left">
      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0 text-left">
        <div className="text-left">
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none flex items-center gap-2 text-left">
            Events &amp; Commercials Ledger
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1 text-left">
            Weddings, Schools, Parties, Vouchers &amp; Commercial Files
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Plus size={14} className="text-emerald-400" />
            <span>Create Event</span>
          </button>
        )}
      </div>

      {/* Control Deck */}
      <div className="flex flex-col sm:flex-row gap-2 w-full bg-slate-50/80 p-2 rounded-xl border border-slate-200 shrink-0 text-left">
        <div className="relative flex-1 shrink-0 text-left">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder={
              activeTab === 'VOUCHER_DIRECTORY'
                ? "Search purchaser, code, or experience..."
                : "Search event title, client, invoice #, or venue..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-xs placeholder:text-slate-400 font-medium text-left"
          />
        </div>

        {activeTab === 'VOUCHER_DIRECTORY' && (
          <div className="flex items-center gap-1 overflow-x-auto shrink-0">
            {['UNBOOKED', 'BOOKED', 'ACTIVE', 'REDEEMED', 'ALL'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setVoucherFilterStatus(st)}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                  voucherFilterStatus === st
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1.5 w-full shrink-0 overflow-x-auto text-left">
        {EVENT_TABS.map((tab) => (
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

      {/* Main Content Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden relative text-left">
        {(isLoading || loadingVouchers) && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100 text-left">
              <Loader2 className="animate-spin text-slate-800" size={20} />
              <span className="text-xs font-bold text-slate-700 text-left">Syncing data...</span>
            </div>
          </div>
        )}

        <div ref={scrollParentRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-slate-50/30 text-left">
          {activeTab === 'VOUCHER_DIRECTORY' ? (
            filteredVouchers.length === 0 && !loadingVouchers ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <Ticket size={36} className="opacity-20 mb-2" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-700">No Vouchers Found</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  No purchased vouchers matched your current filter criteria.
                </p>
              </div>
            ) : (
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {virtualItems.map((virtualRow) => {
                  const voucher = filteredVouchers[virtualRow.index]!;
                  const isBooked = Boolean(voucher.booked_in_at);

                  return (
                    <div
                      key={voucher.id}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute top-0 left-0 w-full pb-2.5 text-left"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 text-left">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {voucher.voucher_code}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                              voucher.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : voucher.status === 'REDEEMED'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {voucher.status}
                            </span>
                            {isBooked ? (
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                                <CalendarCheck size={10} /> Booked for {formatDisplayDate(voucher.booked_in_at)}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
                                Unbooked
                              </span>
                            )}
                          </div>

                          <h3 className="font-black text-slate-900 text-sm tracking-tight truncate">
                            {voucher.purchaser_name} &bull; <span className="text-slate-600 font-medium">{voucher.item_name || voucher.experience_type}</span>
                          </h3>

                          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 flex-wrap">
                            <span>{voucher.purchaser_email}</span>
                            <span>&bull;</span>
                            <span>{voucher.participants} Participant{voucher.participants > 1 ? 's' : ''} {voucher.guests > 0 ? `+ ${voucher.guests} Guests` : ''}</span>
                            <span>&bull;</span>
                            <span>Purchased: {formatDisplayDate(voucher.purchase_date)}</span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {!isBooked && voucher.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => openBookingForVoucher(voucher)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer"
                            >
                              <CalendarCheck size={13} className="text-emerald-400" />
                              <span>Book Schedule</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            filteredEvents.length === 0 && !isLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <Sparkles size={36} className="opacity-20 mb-2" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-700">No Events Found</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  No bookings registered matching the selected category filter.
                </p>
              </div>
            ) : (
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {virtualItems.map((virtualRow) => {
                  const event = filteredEvents[virtualRow.index]!;
                  const comm = event.commercials;
                  const isWedding = event.event_type === 'WEDDING';

                  return (
                    <div
                      key={event.id}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute top-0 left-0 w-full pb-2.5 text-left"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col lg:flex-row items-start justify-between gap-4 text-left">
                        {/* Operational Logistics */}
                        <div className="space-y-2 flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2 flex-wrap text-left">
                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-200 text-left">
                              {event.event_type.replace(/_/g, ' ')}
                            </span>
                            <h3 className="font-black text-slate-900 text-sm tracking-tight truncate text-left">
                              {event.title}
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-left">
                            <div className="space-y-1 text-left">
                              <div className="flex items-center gap-1.5 text-slate-700 font-bold text-left">
                                <CalIcon size={12} className="text-slate-400 shrink-0" />
                                <span>{formatDisplayDate(event.start_time)}</span>
                                <span className="text-slate-400 font-medium">
                                  ({formatDisplayTime(event.start_time)} &ndash; {formatDisplayTime(event.end_time)})
                                </span>
                              </div>
                              
                              {/* Only show Centre Rehearsal for Weddings */}
                              {isWedding && event.rehearsal_at_centre_date && (
                                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 text-left">
                                  Centre Rehearsal: {formatDisplayDate(event.rehearsal_at_centre_date)} {event.rehearsal_at_centre_time ? `at ${formatDisplayTime(event.rehearsal_at_centre_time)}` : ''}
                                </p>
                              )}
                              
                              {/* Only show Onsite Rehearsal for Weddings */}
                              {isWedding && event.rehearsal_time && (
                                <p className="text-[10px] font-black uppercase tracking-wider text-purple-700 text-left">
                                  Onsite Rehearsal: {formatDisplayTime(event.rehearsal_time)}
                                </p>
                              )}
                              <div className="flex items-start gap-1.5 text-[10px] text-slate-500 font-medium text-left">
                                <MapPin size={11} className="text-slate-400 shrink-0 mt-0.5" />
                                <span>{event.venue_address}</span>
                              </div>
                            </div>

                            <div className="space-y-1 text-left">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-800 text-left">
                                <Phone size={11} className="text-slate-400 shrink-0" />
                                <span>Contact: {event.site_contact_name} {event.site_contact_phone ? `(${event.site_contact_phone})` : ''}</span>
                              </div>
                              {event.wedding_flying_participant && (
                                <p className="text-[10px] text-slate-600 font-medium truncate text-left">
                                  Ring Bearer: <span className="font-bold">{event.wedding_flying_participant}</span> {event.wedding_ring_delivery_only ? '(Ring Only)' : '(Ring + Static)'}
                                </p>
                              )}
                              {event.school_talk_curriculum && (
                                <p className="text-[10px] text-slate-600 font-medium truncate text-left">
                                  Topic: <span className="font-bold">{event.school_talk_curriculum}</span>
                                </p>
                              )}
                              {event.party_type && (
                                <p className="text-[10px] text-slate-600 font-medium truncate text-left">
                                  Party: <span className="font-bold">{event.party_type}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Staff & Birds Roster */}
                          <div className="flex items-center gap-4 pt-1 flex-wrap text-left">
                            {event.staff_allocations && event.staff_allocations.length > 0 && (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 text-left">
                                <Users size={12} className="text-slate-400 shrink-0" />
                                <span>Staff:</span>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {event.staff_allocations.map(s => (
                                    <span key={s.id} className="bg-slate-100 px-1.5 py-0.2 rounded text-[9px] font-black text-slate-700">
                                      {s.users?.name?.split(' ')[0] || 'Staff'}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {event.animal_allocations && event.animal_allocations.length > 0 && (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 text-left">
                                <Feather size={12} className="text-emerald-600 shrink-0" />
                                <span>Specimens:</span>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {event.animal_allocations.map(a => (
                                    <span key={a.id} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded text-[9px] font-black" title={a.role_description || undefined}>
                                      {a.animals?.name || 'Bird'}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Commercials Box */}
                        <div className="w-full lg:w-80 bg-slate-50/90 border border-slate-200 rounded-2xl p-3.5 space-y-2 shrink-0 text-left shadow-2xs">
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/80 text-left">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 text-left">
                              <CreditCard size={12} className="text-slate-500" /> Commercials
                            </span>
                            {getPaymentBadge(comm?.payment_status)}
                          </div>

                          <div className="space-y-1 pt-0.5 text-left">
                            <div className="text-xs font-bold text-slate-900 flex justify-between items-center text-left">
                              <span className="text-slate-500 text-[11px] font-medium text-left">Total Fee:</span>
                              <span className="font-mono font-bold text-slate-900">£{Number(comm?.total_amount || 0).toFixed(2)}</span>
                            </div>

                            {comm?.deposit_amount ? (
                              <div className="text-[11px] text-slate-600 flex justify-between items-center text-left">
                                <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider text-left">Deposit:</span>
                                <span className="font-mono font-bold text-amber-700">£{Number(comm.deposit_amount).toFixed(2)}</span>
                              </div>
                            ) : null}
                          </div>

                          {comm?.xero_invoice_number && (
                            <div className="bg-white px-2 py-1 rounded-lg border border-slate-200 flex items-center justify-between gap-2 min-w-0">
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 shrink-0 flex items-center gap-1">
                                <Receipt size={10} /> Ref:
                              </span>
                              <span 
                                className="font-mono text-[10px] font-bold text-slate-800 truncate text-right select-all" 
                                title={comm.xero_invoice_number}
                              >
                                {comm.xero_invoice_number}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 text-left">
                            <span 
                              className="text-[10px] text-slate-400 truncate max-w-[170px] text-left font-medium"
                              title={comm?.client_email || 'No email recorded'}
                            >
                              {comm?.client_email || 'No email recorded'}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditEvent(event);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                                title="Edit Event Record"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({ id: event.id, title: event.title });
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Archive Record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 text-left space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Archive Event?</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Confirmation Required</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Are you sure you want to archive <strong className="text-slate-900 font-bold">{deleteTarget.title}</strong>? This will remove it from active operational rosters.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {deleteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>Archive</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creation / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 font-sans text-left">
          <div className="bg-white border border-slate-200/80 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh] text-left">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 text-left">
              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black shadow-xs shrink-0">
                  {editingEventId ? <Pencil size={17} className="text-amber-400" /> : <Sparkles size={18} />}
                </div>
                <div className="text-left">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight leading-none text-left">
                    {editingEventId ? 'Edit Event & Commercial Record' : 'Register Event & Commercial File'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 text-left">
                    Operations, Multi-Resource Allocation &amp; Xero Invoicing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingEventId(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!form.title.trim() || !form.site_contact_name.trim() || !form.venue_address.trim()) {
                  toast.error('Title, Venue Address and Onsite Contact Name are mandatory.');
                  return;
                }
                saveEventMutation.mutate(form);
              }}
              className="p-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-5 text-xs font-medium bg-white flex-1 text-left"
            >
              {/* Classification Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left">
                <div className="text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 text-left">
                    Event Type *
                  </label>
                  <select
                    value={form.event_type}
                    onChange={(e) => setForm({ ...form, event_type: e.target.value as EventsCalendar['event_type'] })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer text-left"
                  >
                    <option value="WEDDING">Wedding (Ring Delivery &amp; Displays)</option>
                    <option value="SCHOOL_TALK">School Visit / Educational Workshop</option>
                    <option value="PARTY">Birthday Party / Private Celebration</option>
                    <option value="EXPERIENCE">Pre-paid Experience Session</option>
                    <option value="OTHER">Other Arena / Offsite Display</option>
                  </select>
                </div>

                <div className="text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 text-left">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Smith & Jones Wedding Ring Bearer"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 text-left"
                  />
                </div>
              </div>

              {/* Venue Address */}
              <div className="text-left">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 text-left">
                  Venue Address (Full Location &amp; Access Details) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. The Orangery, Turkey Mill, Ashford Rd, Maidstone ME14 5PP"
                  value={form.venue_address}
                  onChange={(e) => setForm({ ...form, venue_address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 text-left"
                />
              </div>

              {/* Dynamic Specifics by Event Type */}
              {form.event_type === 'WEDDING' && (
                <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3.5 text-left">
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-800 block text-left">
                    Wedding Specifics &amp; Dual Rehearsals
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                    <div className="text-left">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1 text-left">
                        Flying Participant &amp; Relation to Couple
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Best Man (James), Groom's Brother"
                        value={form.wedding_flying_participant}
                        onChange={(e) => setForm({ ...form, wedding_flying_participant: e.target.value })}
                        className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                      />
                    </div>

                    <div className="flex items-center pt-4 text-left">
                      <label className="flex items-center gap-2 cursor-pointer text-left">
                        <input
                          type="checkbox"
                          checked={form.wedding_ring_delivery_only}
                          onChange={(e) => setForm({ ...form, wedding_ring_delivery_only: e.target.checked })}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-xs font-bold text-slate-800 text-left">Ring Delivery Only (No Static Reception)</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-purple-100 text-left">
                    <div className="space-y-1 text-left">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-purple-900 text-left">
                        Centre Rehearsal at KOA (Date &amp; Time)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={form.rehearsal_at_centre_date}
                          onChange={(e) => setForm({ ...form, rehearsal_at_centre_date: e.target.value })}
                          className="w-full bg-white border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-bold"
                        />
                        <input
                          type="time"
                          value={form.rehearsal_at_centre_time}
                          onChange={(e) => setForm({ ...form, rehearsal_at_centre_time: e.target.value })}
                          className="w-full bg-white border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 text-left">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-purple-900 text-left">
                        Day-of Onsite Ceremony Rehearsal (Time)
                      </label>
                      <input
                        type="time"
                        value={form.rehearsal_time}
                        onChange={(e) => setForm({ ...form, rehearsal_time: e.target.value })}
                        className="w-full bg-white border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {form.event_type === 'SCHOOL_TALK' && (
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-3 text-left">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-800 block text-left">
                    School Talk Specifics
                  </span>
                  <div className="text-left">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1 text-left">
                      Curriculum Topic / Presentation Required *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. KS2 Nocturnal Hunters &amp; British Habitats"
                      value={form.school_talk_curriculum}
                      onChange={(e) => setForm({ ...form, school_talk_curriculum: e.target.value })}
                      className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}

              {form.event_type === 'PARTY' && (
                <div className="p-4 bg-pink-50/70 border border-pink-200 rounded-2xl space-y-3 text-left">
                  <span className="text-[10px] font-black uppercase tracking-widest text-pink-800 block text-left">
                    Party &amp; Celebration Specifics
                  </span>
                  <div className="text-left">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1 text-left">
                      Party Type / Celebration Theme
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10th Birthday Experience &amp; Meerkat Meet"
                      value={form.party_type}
                      onChange={(e) => setForm({ ...form, party_type: e.target.value })}
                      className="w-full bg-white border border-pink-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}

              {/* Timings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                <div className="text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 text-left">
                    Event Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 text-left">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 text-left">
                    End Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* Day-of Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                <div className="text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 text-left">
                    Onsite Contact Person *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Wedding Coordinator / Teacher Lead"
                    value={form.site_contact_name}
                    onChange={(e) => setForm({ ...form, site_contact_name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="text-left">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 text-left">
                    Onsite Direct Mobile Number
                  </label>
                  <input
                    type="tel"
                    placeholder="07123456789"
                    value={form.site_contact_phone}
                    onChange={(e) => setForm({ ...form, site_contact_phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Staff Allocation */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-left">
                <div className="flex justify-between items-center text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 flex items-center gap-1.5 text-left">
                    <Users size={13} className="text-slate-500" /> Allocate Staff Members ({form.selected_staff_ids.length} Assigned)
                  </label>
                  <input
                    type="text"
                    placeholder="Filter staff..."
                    value={staffSearchQuery}
                    onChange={(e) => setStaffSearchQuery(e.target.value)}
                    className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg w-40"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                  {staffList
                    .filter(s => !staffSearchQuery || s.name.toLowerCase().includes(staffSearchQuery.toLowerCase()))
                    .map(s => {
                      const isSelected = form.selected_staff_ids.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setForm(prev => ({
                              ...prev,
                              selected_staff_ids: isSelected
                                ? prev.selected_staff_ids.filter(id => id !== s.id)
                                : [...prev.selected_staff_ids, s.id]
                            }));
                          }}
                          className={`p-2 rounded-xl text-left border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="truncate">
                            <p className="font-bold text-xs truncate">{s.name}</p>
                            <p className={`text-[9px] font-black uppercase ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {s.role}
                            </p>
                          </div>
                          {isSelected && <Check size={14} className="text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Animal Allocation */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-left">
                <div className="flex justify-between items-center text-left">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 flex items-center gap-1.5 text-left">
                    <Feather size={13} className="text-emerald-600" /> Allocate Specimen Birds ({form.selected_animals.length} Assigned)
                  </label>
                  <input
                    type="text"
                    placeholder="Filter birds..."
                    value={animalSearchQuery}
                    onChange={(e) => setAnimalSearchQuery(e.target.value)}
                    className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg w-40"
                  />
                </div>

                {form.selected_animals.length > 0 && (
                  <div className="space-y-2 p-2 bg-white rounded-xl border border-slate-200 text-left">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block text-left">Assigned Deployments:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                      {form.selected_animals.map((item, idx) => {
                        const animalObj = animals.find(a => a.id === item.animal_id);
                        return (
                          <div key={item.animal_id} className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-left">
                            <span className="font-bold text-xs text-slate-900 truncate w-24">{animalObj?.name || 'Bird'}</span>
                            <input
                              type="text"
                              placeholder="Role (e.g. Ring Flight)"
                              value={item.role_description}
                              onChange={(e) => {
                                const updated = [...form.selected_animals];
                                updated[idx] = { ...updated[idx]!, role_description: e.target.value };
                                setForm({ ...form, selected_animals: updated });
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setForm(prev => ({
                                  ...prev,
                                  selected_animals: prev.selected_animals.filter(a => a.animal_id !== item.animal_id)
                                }));
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                  {animals
                    .filter(a => !animalSearchQuery || a.name.toLowerCase().includes(animalSearchQuery.toLowerCase()) || a.species.toLowerCase().includes(animalSearchQuery.toLowerCase()))
                    .map(a => {
                      const isSelected = form.selected_animals.some(item => item.animal_id === a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setForm(prev => ({
                              ...prev,
                              selected_animals: isSelected
                                ? prev.selected_animals.filter(item => item.animal_id !== a.id)
                                : [...prev.selected_animals, { animal_id: a.id, role_description: form.event_type === 'WEDDING' ? 'Ring Delivery' : 'Flying Display' }]
                            }));
                          }}
                          className={`p-2 rounded-xl text-left border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="truncate">
                            <p className="font-bold text-xs truncate">{a.name}</p>
                            <p className={`text-[9px] truncate ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                              {a.species}
                            </p>
                          </div>
                          {isSelected && <Check size={14} className="text-emerald-300 shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Commercials Section */}
              <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl space-y-3.5 shadow-md text-left">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-left">
                  <Lock size={14} className="text-emerald-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 text-left">
                    Commercials &amp; Xero Invoicing (GDPR Restricted)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                  <div className="text-left">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-left">
                      Client Full Name (Billing)
                    </label>
                    <input
                      type="text"
                      value={form.client_full_name}
                      onChange={(e) => setForm({ ...form, client_full_name: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white text-left"
                    />
                  </div>

                  <div className="text-left">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-left">
                      Client Email
                    </label>
                    <input
                      type="email"
                      value={form.client_email}
                      onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white text-left"
                    />
                  </div>

                  <div className="text-left">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-left">
                      Payment Status
                    </label>
                    <select
                      value={form.payment_status}
                      onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white text-left"
                    >
                      <option value="UNPAID">Unpaid (Awaiting Deposit)</option>
                      <option value="DEPOSIT_PAID">Deposit Paid</option>
                      <option value="PAID_IN_FULL">Paid in Full</option>
                      <option value="NOT_APPLICABLE">Not Applicable (Voucher / Comp)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                  <div className="text-left">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-left">
                      Total Fee (£)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.total_amount}
                      onChange={(e) => setForm({ ...form, total_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white text-left"
                    />
                  </div>

                  <div className="text-left">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-left">
                      Deposit Amount (£)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.deposit_amount}
                      onChange={(e) => setForm({ ...form, deposit_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white text-left"
                    />
                  </div>

                  <div className="text-left">
                    <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 text-left">
                      Xero Invoice #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. INV-1042"
                      value={form.xero_invoice_number}
                      onChange={(e) => setForm({ ...form, xero_invoice_number: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white text-left"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Controls */}
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 text-left">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingEventId(null);
                  }}
                  className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveEventMutation.isPending}
                  className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  {saveEventMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                  <span>{editingEventId ? 'Update Event Record' : 'Register Event File'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EventsManagerPage;