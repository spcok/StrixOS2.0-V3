import { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, queryOptions, keepPreviousData } from '@tanstack/react-query';
import { Pill, Activity, WifiOff, FileText, Plus, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { Animal } from '../../types';
import DigitalMAR from '../../components/medical/DigitalMAR';
import PrescriptionList, { type PrescriptionItem } from '../../components/medical/PrescriptionList';
import PrescriptionFormModal from '../../components/medical/PrescriptionFormModal';
import MedicationHistory from '../../components/medical/MedicationHistory';
import { marExportService } from '../../services/marExportService';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS (14-Day Failover)
// ------------------------------------------------------------------
const getActivePrescriptionsOptions = () =>
  queryOptions({
    queryKey: ['prescriptions', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescriptions')
        .select(`
          *,
          animals ( id, name, species, location, gender, ring_number, average_target_weight, date_of_birth, status )
        `)
        .eq('status', 'ACTIVE')
        .eq('is_deleted', false)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return (data || []) as PrescriptionItem[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
    meta: { persist: true },
  });

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION
// ------------------------------------------------------------------
export const Route = createFileRoute('/clinical/medications')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(getActivePrescriptionsOptions());
  },
  component: MedicationsModule,
});

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function MedicationsModule() {
  const queryClient = useQueryClient();
  const { user, profile, hasPermission } = useAuth();

  const [activeTab, setActiveTab] = useState<'DIGITAL_MAR' | 'PRESCRIPTIONS' | 'HISTORY'>('DIGITAL_MAR');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<PrescriptionItem | null>(null);

  // Network State Listeners
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

  // Realtime Cache Invalidation for MAR Events & Prescriptions
  useEffect(() => {
    const adminChannel = supabase
      .channel('medication_administrations_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'medication_administrations' },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['medication_administrations'],
            refetchType: 'active',
          });
        }
      )
      .subscribe();

    const rxChannel = supabase
      .channel('prescriptions_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prescriptions' },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['prescriptions'],
            refetchType: 'active',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(adminChannel);
      supabase.removeChannel(rxChannel);
    };
  }, [queryClient]);

  // Fetch Prescriptions
  const { data: prescriptions = [], isLoading: loadingRx } = useQuery({
    ...getActivePrescriptionsOptions(),
    placeholderData: keepPreviousData,
  });

  const handleOpenNewOrder = () => {
    setEditingPrescription(null);
    setIsPrescriptionModalOpen(true);
  };

  const handleEditOrder = (rx: PrescriptionItem) => {
    setEditingPrescription(rx);
    setIsPrescriptionModalOpen(true);
  };

  const handlePrintUnifiedMar = async (rx: PrescriptionItem, setLoading: (b: boolean) => void) => {
    if (!isOnline) {
      toast.error('Offline: Document compilation requires an active network connection.');
      return;
    }

    setLoading(true);
    try {
      const patientPrescriptions = prescriptions.filter((p) => p.animal_id === rx.animal_id);
      await marExportService.exportUnifiedMAR(
        (rx.animals || {}) as Animal,
        patientPrescriptions,
        profile?.name || 'Authorized Staff',
        user?.id || 'Staff-ID'
      );
      toast.success('Unified MAR chart exported successfully');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Export failed';
      console.error('[MedicationsModule] MAR Export Error:', error);
      toast.error(`Failed to generate DOCX MAR chart: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'DIGITAL_MAR', label: "Today's MAR", icon: Activity },
    { id: 'PRESCRIPTIONS', label: 'Active Orders', icon: Pill },
    { id: 'HISTORY', label: 'Medication History', icon: FileText },
  ] as const;

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden space-y-2 lg:space-y-2.5 font-sans">
      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl shadow-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-rose-900">
            <WifiOff size={18} className="text-rose-600 shrink-0" />
            <div>
              <span className="font-black uppercase tracking-widest text-[10px] text-rose-600 block leading-none">
                Clinical Network Disconnected
              </span>
              <span className="text-xs font-bold text-slate-700 mt-0.5 block">
                Medication administration is locked to prevent double-dosing. Reconnect to WiFi to sign off doses.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Header Ribbon */}
      <div className="flex justify-between items-center w-full shrink-0">
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none">
            Clinical Dispensary
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Prescription Management &amp; Digital MAR
          </p>
        </div>

        {hasPermission('clinical:write') && (
          <button
            type="button"
            onClick={handleOpenNewOrder}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Plus size={14} className="text-blue-400" />
            <span>Provision Order</span>
          </button>
        )}
      </div>

      {/* View Tabs */}
      <div className="flex gap-1.5 w-full shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-[9px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white border border-slate-800 shadow-slate-900/20'
                : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
            }`}
          >
            <tab.icon size={13} className={activeTab === tab.id ? 'text-blue-400' : 'text-slate-400'} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-h-0 relative overflow-hidden">
        {loadingRx && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center rounded-2xl">
            <div className="bg-white p-3.5 rounded-xl shadow-lg flex items-center gap-2.5 border border-slate-100">
              <Loader2 className="animate-spin text-blue-600" size={20} />
              <span className="text-xs font-bold text-slate-700">Syncing Prescriptions...</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'DIGITAL_MAR' && (
            <DigitalMAR prescriptions={prescriptions} isOnline={isOnline} />
          )}
          {activeTab === 'PRESCRIPTIONS' && (
            <PrescriptionList
              prescriptions={prescriptions}
              onEditOrder={handleEditOrder}
              onPrintMar={handlePrintUnifiedMar}
            />
          )}
          {activeTab === 'HISTORY' && <MedicationHistory />}
        </div>
      </div>

      {/* Prescription Entry / Edit Modal */}
      {isPrescriptionModalOpen && (
        <PrescriptionFormModal
          isOpen={isPrescriptionModalOpen}
          onClose={() => setIsPrescriptionModalOpen(false)}
          initialData={editingPrescription}
        />
      )}
    </div>
  );
}

export default MedicationsModule;