import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  History, 
  Loader2, 
  Download, 
  Filter, 
  Pill, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Calendar,
  UserRound
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { reportExportService } from '../../services/reportExportService';
import type { Animal } from '../../types';

export interface HistoricPrescription {
  id: string;
  animal_id: string;
  drug_name: string;
  concentration?: string | null;
  dosage: string;
  route: string;
  frequency: string;
  order_type?: string;
  status: 'COMPLETED' | 'DISCONTINUED' | 'CANCELLED' | 'EXPIRED' | string;
  start_date: string;
  end_date?: string | null;
  prescribing_vet_name?: string | null;
  prescribing_clinic?: string | null;
  indication?: string | null;
  special_instructions?: string | null;
  animals?: Partial<Animal> | null;
}

const formatDisplayDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('T')[0]!.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getStatusBadge = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
          <CheckCircle2 size={11} className="text-emerald-600" /> Completed
        </span>
      );
    case 'DISCONTINUED':
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
          <AlertCircle size={11} className="text-amber-600" /> Discontinued
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
          <XCircle size={11} className="text-rose-600" /> Cancelled
        </span>
      );
    default:
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
          {status || 'ARCHIVED'}
        </span>
      );
  }
};

export default function MedicationHistory() {
  const { profile } = useAuth();
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  // Fetch inactive/historic prescriptions
  const { data: history = [], isLoading } = useQuery<HistoricPrescription[]>({
    queryKey: ['prescriptions', 'history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescriptions')
        .select(`
          *,
          animals ( id, name, species, ring_number, location )
        `)
        .neq('status', 'ACTIVE')
        .order('end_date', { ascending: false });

      if (error) throw error;
      return (data || []) as HistoricPrescription[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: 'offlineFirst',
  });

  const uniqueAnimals = useMemo(() => {
    const map = new Map<string, Partial<Animal>>();
    history.forEach((rx) => {
      if (rx.animals?.id) {
        map.set(rx.animals.id, rx.animals);
      }
    });
    return Array.from(map.values());
  }, [history]);

  const filteredHistory = useMemo(() => {
    if (selectedAnimalId === 'ALL') return history;
    return history.filter((rx) => rx.animal_id === selectedAnimalId);
  }, [history, selectedAnimalId]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportData = filteredHistory.map((rx) => [
        rx.animals?.name || 'Unknown Specimen',
        rx.drug_name,
        rx.dosage,
        `${rx.route} / ${rx.frequency}`,
        formatDisplayDate(rx.start_date),
        formatDisplayDate(rx.end_date),
        rx.status || 'CLOSED',
      ]);

      await reportExportService.exportSingleReport(
        {
          title: 'Patient Medication History & Dispensary Log',
          columns: ['Specimen', 'Medication', 'Dosage', 'Route/Freq', 'Start Date', 'End Date', 'Status'],
          data: exportData,
          generatorName: profile?.name || 'Authorized Staff',
          dateRange: 'All Historic Courses',
        },
        'MED_HISTORY'
      );
      toast.success('Medication history report exported successfully');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Export operation failed';
      console.error('[MedicationHistory] Export error:', error);
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-xs gap-3">
        <Loader2 size={24} className="animate-spin text-emerald-600" />
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Compiling Historic Dispensary Ledger...
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col min-h-[500px] overflow-hidden font-sans">
      {/* Control Deck & Filter Header */}
      <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs w-full sm:w-auto">
          <Filter size={13} className="text-slate-400 shrink-0" />
          <select
            value={selectedAnimalId}
            onChange={(e) => setSelectedAnimalId(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-800 uppercase tracking-wider border-none focus:ring-0 cursor-pointer outline-none w-full sm:w-60 truncate py-0.5"
          >
            <option value="ALL">All Historic Patients ({uniqueAnimals.length})</option>
            {uniqueAnimals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.species || 'Unknown'}) {a.ring_number ? `• ${a.ring_number}` : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || filteredHistory.length === 0}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase tracking-widest text-[10px] sm:text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer active:scale-95 shrink-0"
        >
          {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          <span>Export ZLA Ledger</span>
        </button>
      </div>

      {/* Historic Records List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar space-y-2.5 bg-slate-50/30">
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <History size={32} className="opacity-30" />
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">No Historic Orders Found</h3>
            <p className="text-[10px] font-medium text-slate-400">
              There are no completed or discontinued clinical orders matching this criteria.
            </p>
          </div>
        ) : (
          filteredHistory.map((rx) => {
            const patient = rx.animals;

            return (
              <div
                key={rx.id}
                className="p-3.5 sm:p-4 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-300 transition-all shadow-xs"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-slate-900 text-xs sm:text-sm tracking-tight truncate">
                      {rx.drug_name}
                    </h4>
                    {rx.concentration && (
                      <span className="text-[10px] font-bold text-slate-400">
                        ({rx.concentration})
                      </span>
                    )}
                    <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                      {rx.dosage}
                    </span>
                  </div>

                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-400">Specimen:</span>
                    <span className="text-slate-800">{patient?.name || 'Unknown Specimen'}</span>
                    <span className="text-slate-400">&bull;</span>
                    <span className="italic font-medium text-slate-500">{patient?.species || '--'}</span>
                    {patient?.ring_number && (
                      <>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-500 font-mono font-bold">[{patient.ring_number}]</span>
                      </>
                    )}
                  </p>

                  <p className="text-[10px] text-slate-500 font-medium">
                    <span className="font-bold text-slate-700">Administration:</span> {rx.route} &bull; {rx.frequency}
                    {rx.prescribing_vet_name && (
                      <span className="ml-2 font-medium text-slate-400">
                        (Prescribed by: {rx.prescribing_vet_name})
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {getStatusBadge(rx.status)}
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                    <Calendar size={10} className="text-slate-400" />
                    <span>{formatDisplayDate(rx.start_date)} &ndash; {formatDisplayDate(rx.end_date)}</span>
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}