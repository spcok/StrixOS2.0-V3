import { useState, useEffect } from 'react';
import { useForm, type FieldApi } from '@tanstack/react-form';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as v from 'valibot';
import { X, Save, Loader2, Pill, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { Animal } from '../../types';

export interface PrescriptionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    id?: string;
    animal_id?: string;
    clinical_record_id?: string | null;
    order_type?: 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT';
    drug_name?: string;
    concentration?: string;
    dosage?: string;
    route?: string;
    frequency?: string;
    is_prn?: boolean;
    indication?: string;
    special_instructions?: string;
    start_date?: string;
    end_date?: string | null;
    prescribing_vet_name?: string;
    prescribing_clinic?: string;
    status?: string;
  } | null;
}

interface PrescriptionFormValues {
  animal_id: string;
  order_type: 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT';
  drug_name: string;
  concentration: string;
  dosage: string;
  route: string;
  frequency: string;
  is_prn: boolean;
  start_date: string;
  end_date: string;
  indication: string;
  special_instructions: string;
  prescribing_vet_name: string;
  prescribing_clinic: string;
}

const PrescriptionSchema = v.pipe(
  v.object({
    animal_id: v.pipe(v.string(), v.minLength(1, 'Target specimen is required')),
    order_type: v.picklist(['PRESCRIPTION', 'OTC', 'SUPPLEMENT']),
    drug_name: v.pipe(v.string(), v.minLength(1, 'Medication / drug name is required')),
    concentration: v.optional(v.string()),
    dosage: v.pipe(v.string(), v.minLength(1, 'Dosage amount is required')),
    route: v.pipe(v.string(), v.minLength(1, 'Route of administration is required')),
    frequency: v.pipe(v.string(), v.minLength(1, 'Dosing frequency is required')),
    is_prn: v.boolean(),
    start_date: v.pipe(v.string(), v.minLength(1, 'Start date is required')),
    end_date: v.optional(v.string()),
    indication: v.optional(v.string()),
    special_instructions: v.optional(v.string()),
    prescribing_vet_name: v.optional(v.string()),
    prescribing_clinic: v.optional(v.string()),
  }),
  v.check((data) => {
    if (data.order_type === 'PRESCRIPTION') {
      return Boolean(data.prescribing_vet_name && data.prescribing_vet_name.trim().length > 0);
    }
    return true;
  }, 'Prescribing Veterinarian name is required for Rx orders'),
  v.check((data) => {
    if (data.end_date && data.end_date.trim().length > 0 && data.start_date) {
      return data.end_date >= data.start_date;
    }
    return true;
  }, 'End date must be on or after the start date')
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

export function PrescriptionFormModal({
  isOpen,
  onClose,
  initialData,
}: PrescriptionFormModalProps) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: animals = [] } = useQuery<Animal[]>({
    queryKey: ['animals', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('animals')
        .select('id, name, species, location, category')
        .neq('status', 'ARCHIVED')
        .order('name');
      if (error) throw error;
      return (data || []) as Animal[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: PrescriptionFormValues) => {
      const result = v.safeParse(PrescriptionSchema, values);
      if (!result.success) {
        throw new Error(result.issues[0]?.message || 'Validation failed');
      }

      const payload = {
        animal_id: values.animal_id,
        order_type: values.order_type,
        drug_name: values.drug_name.trim(),
        concentration: values.concentration.trim() || null,
        dosage: values.dosage.trim(),
        route: values.route,
        frequency: values.frequency,
        is_prn: values.is_prn || values.frequency === 'PRN',
        start_date: values.start_date,
        end_date: values.end_date.trim() ? values.end_date : null,
        indication: values.indication.trim() || null,
        special_instructions: values.special_instructions.trim() || null,
        prescribing_vet_name:
          values.order_type === 'PRESCRIPTION'
            ? values.prescribing_vet_name.trim() || null
            : null,
        prescribing_clinic:
          values.order_type === 'PRESCRIPTION'
            ? values.prescribing_clinic.trim() || null
            : null,
        status: initialData?.status || 'ACTIVE',
        is_deleted: false,
        internal_authorizing_user: user?.id || profile?.id || null,
      };

      if (initialData?.id) {
        const { data, error } = await supabase
          .from('prescriptions')
          .update(payload)
          .eq('id', initialData.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const recordId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2);

      const { data, error } = await supabase
        .from('prescriptions')
        .insert([{ ...payload, id: recordId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(
        initialData?.id
          ? 'Clinical medication order updated'
          : 'Prescription order authorized & queued'
      );
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['active_mars'] });
      queryClient.invalidateQueries({ queryKey: ['medication_administrations'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to commit medication order';
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const form = useForm<PrescriptionFormValues>({
    defaultValues: {
      animal_id: initialData?.animal_id || '',
      order_type: initialData?.order_type || 'PRESCRIPTION',
      drug_name: initialData?.drug_name || '',
      concentration: initialData?.concentration || '',
      dosage: initialData?.dosage || '',
      route: initialData?.route || 'PO',
      frequency: initialData?.frequency || 'SID',
      is_prn: Boolean(initialData?.is_prn),
      start_date: initialData?.start_date || getLocalDateString(),
      end_date: initialData?.end_date || '',
      indication: initialData?.indication || '',
      special_instructions: initialData?.special_instructions || '',
      prescribing_vet_name: initialData?.prescribing_vet_name || '',
      prescribing_clinic: initialData?.prescribing_clinic || '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(PrescriptionSchema, value);
        if (!result.success) {
          return result.issues[0]?.message || 'Please complete all required fields';
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      await saveMutation.mutateAsync(value);
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      setSaveError(null);
      form.setFieldValue('animal_id', initialData?.animal_id || '');
      form.setFieldValue('order_type', initialData?.order_type || 'PRESCRIPTION');
      form.setFieldValue('drug_name', initialData?.drug_name || '');
      form.setFieldValue('concentration', initialData?.concentration || '');
      form.setFieldValue('dosage', initialData?.dosage || '');
      form.setFieldValue('route', initialData?.route || 'PO');
      form.setFieldValue('frequency', initialData?.frequency || 'SID');
      form.setFieldValue('is_prn', Boolean(initialData?.is_prn));
      form.setFieldValue('start_date', initialData?.start_date || getLocalDateString());
      form.setFieldValue('end_date', initialData?.end_date || '');
      form.setFieldValue('indication', initialData?.indication || '');
      form.setFieldValue('special_instructions', initialData?.special_instructions || '');
      form.setFieldValue('prescribing_vet_name', initialData?.prescribing_vet_name || '');
      form.setFieldValue('prescribing_clinic', initialData?.prescribing_clinic || '');
    }
  }, [isOpen, initialData, form]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md overflow-hidden flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] border border-slate-200/80 overflow-hidden">
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-black shadow-xs shrink-0">
              <Pill size={18} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight uppercase leading-none">
                {initialData?.id ? 'Edit Clinical Medication Order' : 'Provision Medication Order'}
              </h2>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                Dispensary &amp; Digital MAR Protocol
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 bg-white">
          {saveError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs font-medium">
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <div>{saveError}</div>
            </div>
          )}

          <form
            id="rx-mutation-form"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4"
          >
            {/* Specimen Target Selector */}
            <form.Field name="animal_id">
              {(field: FieldApi<PrescriptionFormValues, 'animal_id', any, any>) => (
                <div className="space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <label
                    htmlFor="rx-animal-id"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Target Specimen *
                  </label>
                  <select
                    id="rx-animal-id"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
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

            {/* Order Classification Toggles */}
            <form.Field name="order_type">
              {(field: FieldApi<PrescriptionFormValues, 'order_type', any, any>) => (
                <div className="space-y-1">
                  <label className="block text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Order Classification
                  </label>
                  <div className="grid grid-cols-3 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => field.handleChange('PRESCRIPTION')}
                      className={`py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                        field.state.value === 'PRESCRIPTION'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Prescription (Rx)
                    </button>
                    <button
                      type="button"
                      onClick={() => field.handleChange('OTC')}
                      className={`py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                        field.state.value === 'OTC'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Over-the-Counter
                    </button>
                    <button
                      type="button"
                      onClick={() => field.handleChange('SUPPLEMENT')}
                      className={`py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                        field.state.value === 'SUPPLEMENT'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Nutraceutical
                    </button>
                  </div>
                </div>
              )}
            </form.Field>

            {/* Conditional Veterinarian Info */}
            <form.Subscribe
              selector={(state) => state.values.order_type}
              children={(orderType) =>
                orderType === 'PRESCRIPTION' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-blue-50/40 p-3 rounded-2xl border border-blue-100">
                    <form.Field name="prescribing_vet_name">
                      {(field: FieldApi<PrescriptionFormValues, 'prescribing_vet_name', any, any>) => (
                        <div className="space-y-1">
                          <label
                            htmlFor="rx-prescribing-vet"
                            className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-blue-950"
                          >
                            Prescribing Vet MRCVS *
                          </label>
                          <input
                            id="rx-prescribing-vet"
                            type="text"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="e.g. Dr. Sarah Jenkins"
                            className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                          <FieldError meta={field.state.meta} />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name="prescribing_clinic">
                      {(field: FieldApi<PrescriptionFormValues, 'prescribing_clinic', any, any>) => (
                        <div className="space-y-1">
                          <label
                            htmlFor="rx-prescribing-clinic"
                            className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-blue-950"
                          >
                            Clinic / Practice Name
                          </label>
                          <input
                            id="rx-prescribing-clinic"
                            type="text"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="e.g. Avian &amp; Exotic Veterinary Clinic"
                            className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                      )}
                    </form.Field>
                  </div>
                ) : null
              }
            />

            {/* Drug Name & Concentration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <form.Field name="drug_name">
                  {(field: FieldApi<PrescriptionFormValues, 'drug_name', any, any>) => (
                    <div className="space-y-1">
                      <label
                        htmlFor="rx-drug-name"
                        className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        Medication / Formulation *
                      </label>
                      <input
                        id="rx-drug-name"
                        type="text"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. Meloxicam Oral Suspension"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <FieldError meta={field.state.meta} />
                    </div>
                  )}
                </form.Field>
              </div>

              <div>
                <form.Field name="concentration">
                  {(field: FieldApi<PrescriptionFormValues, 'concentration', any, any>) => (
                    <div className="space-y-1">
                      <label
                        htmlFor="rx-concentration"
                        className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        Strength / Conc.
                      </label>
                      <input
                        id="rx-concentration"
                        type="text"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. 1.5mg/ml"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            </div>

            {/* Dosage, Route & Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <form.Field name="dosage">
                {(field: FieldApi<PrescriptionFormValues, 'dosage', any, any>) => (
                  <div className="space-y-1">
                    <label
                      htmlFor="rx-dosage"
                      className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      Dose Amount *
                    </label>
                    <input
                      id="rx-dosage"
                      type="text"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="e.g. 0.25ml (0.5mg/kg)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>

              <form.Field name="route">
                {(field: FieldApi<PrescriptionFormValues, 'route', any, any>) => (
                  <div className="space-y-1">
                    <label
                      htmlFor="rx-route"
                      className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      Route *
                    </label>
                    <select
                      id="rx-route"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                    >
                      <option value="PO">Oral (PO)</option>
                      <option value="IM">Intramuscular (IM)</option>
                      <option value="SC">Subcutaneous (SC)</option>
                      <option value="IV">Intravenous (IV)</option>
                      <option value="TOPICAL">Topical / Cutaneous</option>
                      <option value="OPHTH">Ophthalmic (Eye)</option>
                      <option value="INHAL">Nebulized / Inhaled</option>
                    </select>
                  </div>
                )}
              </form.Field>

              <form.Field name="frequency">
                {(field: FieldApi<PrescriptionFormValues, 'frequency', any, any>) => (
                  <div className="space-y-1">
                    <label
                      htmlFor="rx-frequency"
                      className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      Frequency *
                    </label>
                    <select
                      id="rx-frequency"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                    >
                      <option value="SID">Once Daily (SID)</option>
                      <option value="BID">Twice Daily (BID)</option>
                      <option value="TID">Three Times Daily (TID)</option>
                      <option value="QID">Four Times Daily (QID)</option>
                      <option value="EOD">Every Other Day (EOD)</option>
                      <option value="STAT">Single Immediate (STAT)</option>
                      <option value="WEEKLY">Once Weekly</option>
                      <option value="MONTHLY">Once Monthly</option>
                      <option value="PRN">PRN (As Needed)</option>
                    </select>
                  </div>
                )}
              </form.Field>
            </div>

            {/* PRN Checkbox */}
            <form.Field name="is_prn">
              {(field: FieldApi<PrescriptionFormValues, 'is_prn', any, any>) => (
                <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100/80 transition-colors w-max">
                  <input
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-bold text-slate-700">
                    PRN Flag (Administer on clinical indication only)
                  </span>
                </label>
              )}
            </form.Field>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <form.Field name="start_date">
                {(field: FieldApi<PrescriptionFormValues, 'start_date', any, any>) => (
                  <div className="space-y-1">
                    <label
                      htmlFor="rx-start-date"
                      className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      Therapeutic Start Date *
                    </label>
                    <input
                      id="rx-start-date"
                      type="date"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>

              <form.Field name="end_date">
                {(field: FieldApi<PrescriptionFormValues, 'end_date', any, any>) => (
                  <div className="space-y-1">
                    <label
                      htmlFor="rx-end-date"
                      className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      Course End Date (Leave blank if indefinite)
                    </label>
                    <input
                      id="rx-end-date"
                      type="date"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>
            </div>

            {/* Clinical Indication & Instructions */}
            <form.Field name="indication">
              {(field: FieldApi<PrescriptionFormValues, 'indication', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="rx-indication"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Clinical Indication / Diagnosis
                  </label>
                  <input
                    id="rx-indication"
                    type="text"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Left foot bumblefoot grade II analgesia"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="special_instructions">
              {(field: FieldApi<PrescriptionFormValues, 'special_instructions', any, any>) => (
                <div className="space-y-1">
                  <label
                    htmlFor="rx-instructions"
                    className="block text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500"
                  >
                    Administration Instructions for Keepers
                  </label>
                  <textarea
                    id="rx-instructions"
                    rows={2}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Inject into day-old chick head before morning feeding..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                  />
                </div>
              )}
            </form.Field>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
            Verify against authorized veterinary prescription
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <button
                  type="submit"
                  form="rx-mutation-form"
                  disabled={isSubmitting || saveMutation.isPending}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xs active:scale-95 cursor-pointer"
                >
                  {isSubmitting || saveMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {initialData?.id ? 'Update Order' : 'Authorize Order'}
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrescriptionFormModal;