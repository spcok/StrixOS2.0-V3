import { useState } from 'react';
import { 
  Clock, 
  Edit2, 
  AlertTriangle, 
  Printer, 
  Loader2, 
  Pill, 
  Calendar, 
  User, 
  FileText 
} from 'lucide-react';
import type { Animal } from '../../types';

export interface PrescriptionItem {
  id: string;
  animal_id: string;
  clinical_record_id?: string | null;
  order_type: 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT' | string;
  drug_name: string;
  concentration?: string | null;
  dosage: string;
  route: string;
  frequency: string;
  is_prn?: boolean | null;
  indication?: string | null;
  special_instructions?: string | null;
  start_date: string;
  end_date?: string | null;
  prescribing_vet_name?: string | null;
  prescribing_clinic?: string | null;
  status?: string;
  animals?: Partial<Animal> | null;
}

export interface PrescriptionListProps {
  prescriptions: PrescriptionItem[];
  onEditOrder: (rx: PrescriptionItem) => void;
  onPrintMar: (rx: PrescriptionItem, setLocalLoading: (b: boolean) => void) => void;
}

const formatDisplayDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('T')[0]!.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getOrderBadge = (type: string) => {
  switch (type) {
    case 'PRESCRIPTION':
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
          Rx Prescription
        </span>
      );
    case 'OTC':
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
          Over-The-Counter
        </span>
      );
    case 'SUPPLEMENT':
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
          Nutraceutical
        </span>
      );
    default:
      return (
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
          {type}
        </span>
      );
  }
};

export default function PrescriptionList({
  prescriptions,
  onEditOrder,
  onPrintMar,
}: PrescriptionListProps) {
  const [printingId, setPrintingId] = useState<string | null>(null);

  if (prescriptions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 shadow-xs flex flex-col items-center justify-center">
        <Pill size={32} className="text-slate-300 mb-2" />
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">
          No Active Medication Orders
        </h3>
        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
          There are currently no active veterinary prescriptions or dispensary items in the system.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4 font-sans">
      {prescriptions.map((rx) => {
        const patient = rx.animals;
        const isPrinting = printingId === rx.id;

        return (
          <div
            key={rx.id}
            className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
          >
            <div>
              {/* Header: Drug Name & Classification */}
              <div className="flex justify-between items-start gap-2 mb-2.5">
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-slate-900 text-sm sm:text-base tracking-tight truncate" title={rx.drug_name}>
                    {rx.drug_name}
                  </h3>
                  {rx.concentration && (
                    <span className="text-[10px] font-bold text-slate-400 block mt-0.5">
                      {rx.concentration}
                    </span>
                  )}
                  <div className="mt-1.5">{getOrderBadge(rx.order_type)}</div>
                </div>

                <button
                  type="button"
                  onClick={() => onEditOrder(rx)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Edit Medication Order"
                >
                  <Edit2 size={14} />
                </button>
              </div>

              {/* Posology & Dosing Formulation */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3">
                <p className="text-xs font-black text-slate-800 tracking-tight">
                  {rx.dosage} &bull; <span className="text-blue-600 uppercase">{rx.route}</span> &bull; {rx.frequency}
                </p>
                {rx.special_instructions && (
                  <p className="text-[10px] text-slate-500 font-medium italic mt-1 line-clamp-2">
                    &ldquo;{rx.special_instructions}&rdquo;
                  </p>
                )}
              </div>

              {/* PRN Warning Pill */}
              {rx.is_prn && (
                <div className="mb-3 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md w-fit border border-amber-200">
                  <AlertTriangle size={11} className="shrink-0 text-amber-600" />
                  PRN (On Clinical Indication Only)
                </div>
              )}

              {/* Patient Attribution Card */}
              <div className="bg-white border border-slate-200/80 p-2.5 rounded-xl mb-3.5">
                <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                  Assigned Specimen
                </span>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800 truncate">
                    {patient?.name || 'Unknown Specimen'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold truncate">
                    {patient?.species || patient?.ring_number || '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer: Date Range & Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 truncate">
                <Clock size={11} className="shrink-0 text-slate-400" />
                {rx.end_date ? `Ends: ${formatDisplayDate(rx.end_date)}` : 'Indefinite Order'}
              </span>

              <button
                type="button"
                disabled={printingId !== null}
                onClick={() => {
                  setPrintingId(rx.id);
                  onPrintMar(rx, (loading: boolean) => (loading ? setPrintingId(rx.id) : setPrintingId(null)));
                }}
                className="text-[9px] font-black text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 uppercase tracking-widest flex items-center gap-1 transition-all px-2.5 py-1.5 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer active:scale-95 shrink-0"
              >
                {isPrinting ? (
                  <Loader2 size={11} className="animate-spin text-slate-600" />
                ) : (
                  <Printer size={11} className="text-slate-600" />
                )}
                <span>Print MAR</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}