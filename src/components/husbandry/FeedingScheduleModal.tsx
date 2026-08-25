import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addWeeks, format, parseISO } from 'date-fns';
import { Calendar, Loader2, RefreshCw, Sparkles, Utensils, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import {
  type CreateFeedingScheduleInput,
  scheduledFeedingService,
} from '../../services/scheduledFeedingService';
import type { Animal, FeedingSchedule } from '../../types';

export interface FeedingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  animal?: Animal | null;
  animalId?: string;
  initialData?: FeedingSchedule | null;
}

type ScheduleMode = 'SINGLE' | 'DAILY' | 'INTERVAL' | 'CUSTOM_DAYS';

const DAYS_OF_WEEK = [
  { label: 'Mon', value: 'Monday', dayIndex: 1 },
  { label: 'Tue', value: 'Tuesday', dayIndex: 2 },
  { label: 'Wed', value: 'Wednesday', dayIndex: 3 },
  { label: 'Thu', value: 'Thursday', dayIndex: 4 },
  { label: 'Fri', value: 'Friday', dayIndex: 5 },
  { label: 'Sat', value: 'Saturday', dayIndex: 6 },
  { label: 'Sun', value: 'Sunday', dayIndex: 0 },
];

export function FeedingScheduleModal({
  isOpen,
  onClose,
  animal,
  animalId,
  initialData,
}: FeedingScheduleModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const targetAnimalId = animal?.id || animalId || initialData?.animal_id || '';
  const animalCategory = animal?.category?.toUpperCase().trim() || '';

  // Form State
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    (initialData?.schedule_mode as ScheduleMode) || 'SINGLE'
  );
  const [startDate, setStartDate] = useState(
    initialData?.scheduled_date || format(new Date(), 'yyyy-MM-dd')
  );
  const [foodType, setFoodType] = useState(initialData?.food_type || 'Day-Old Chick');
  const [quantity, setQuantity] = useState<number>(initialData?.quantity ?? 1);
  const [quantityUnit, setQuantityUnit] = useState(
    initialData?.quantity_unit === 'item' ? 'whole_item' : initialData?.quantity_unit || 'whole_item'
  );
  const [presentationMethod, setPresentationMethod] = useState(
    initialData?.presentation_method || 'Bowl / Dish'
  );
  const [supplements, setSupplements] = useState(initialData?.supplements || '');
  const [calciDust, setCalciDust] = useState(
    Boolean(initialData?.calci_dust ?? initialData?.requires_calcidust ?? false)
  );
  const [notes, setNotes] = useState(initialData?.notes || '');

  // Recurrence Configuration State
  const [intervalValue, setIntervalValue] = useState<number>(7);
  const [intervalUnit, setIntervalUnit] = useState<'days' | 'weeks'>('days');
  const [selectedDays, setSelectedDays] = useState<string[]>(
    Array.isArray(initialData?.selected_days) ? initialData.selected_days : []
  );
  const [occurrences, setOccurrences] = useState<number>(6);

  // Operational Lists Query (Food Taxonomy)
  const { data: operationalLists = [] } = useQuery({
    queryKey: ['operational_lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_lists')
        .select('*')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 15,
  });

  const foodOptions = useMemo(() => {
    return operationalLists
      .filter((l: { category?: string; animal_category?: string }) => {
        if (l.category?.toLowerCase() !== 'food_type') return false;
        const targetCat = l.animal_category?.toUpperCase().trim();
        return !targetCat || !animalCategory || targetCat.includes(animalCategory);
      })
      .map((f: { name: string }) => f.name);
  }, [operationalLists, animalCategory]);

  const methodOptions = useMemo(() => {
    return operationalLists
      .filter((l: { category?: string; animal_category?: string }) => {
        if (l.category?.toLowerCase() !== 'feed_method') return false;
        const targetCat = l.animal_category?.toUpperCase().trim();
        return !targetCat || !animalCategory || targetCat.includes(animalCategory);
      })
      .map((m: { name: string }) => m.name);
  }, [operationalLists, animalCategory]);

  useEffect(() => {
    if (initialData) {
      setStartDate(initialData.scheduled_date || format(new Date(), 'yyyy-MM-dd'));
      setFoodType(initialData.food_type || 'Day-Old Chick');
      setQuantity(initialData.quantity ?? 1);
      setQuantityUnit(
        initialData.quantity_unit === 'item' ? 'whole_item' : initialData.quantity_unit || 'whole_item'
      );
      setPresentationMethod(initialData.presentation_method || 'Bowl / Dish');
      setSupplements(initialData.supplements || '');
      setCalciDust(Boolean(initialData.calci_dust ?? initialData.requires_calcidust ?? false));
      setNotes(initialData.notes || '');
      setScheduleMode((initialData.schedule_mode as ScheduleMode) || 'SINGLE');
      setSelectedDays(Array.isArray(initialData.selected_days) ? initialData.selected_days : []);
    } else {
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setFoodType(foodOptions[0] || 'Day-Old Chick');
      setQuantity(1);
      setQuantityUnit('whole_item');
      setPresentationMethod(methodOptions[0] || 'Bowl / Dish');
      setSupplements('');
      setCalciDust(false);
      setNotes('');
      setScheduleMode('SINGLE');
      setSelectedDays([]);
      setIntervalValue(7);
      setIntervalUnit('days');
      setOccurrences(6);
    }
  }, [initialData, foodOptions, methodOptions]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Projected Dates Generator (Option A Engine)
  const projectedDates = useMemo<string[]>(() => {
    if (initialData?.id || scheduleMode === 'SINGLE') {
      return [startDate];
    }

    const baseDate = parseISO(startDate);
    if (Number.isNaN(baseDate.getTime())) return [];

    if (scheduleMode === 'DAILY') {
      return Array.from({ length: occurrences }, (_, i) =>
        format(addDays(baseDate, i), 'yyyy-MM-dd')
      );
    }

    if (scheduleMode === 'INTERVAL') {
      const stepDays = intervalUnit === 'weeks' ? intervalValue * 7 : intervalValue;
      return Array.from({ length: occurrences }, (_, i) =>
        format(addDays(baseDate, i * stepDays), 'yyyy-MM-dd')
      );
    }

    if (scheduleMode === 'CUSTOM_DAYS') {
      if (selectedDays.length === 0) return [];

      const targetDayIndices = DAYS_OF_WEEK.filter((d) =>
        selectedDays.includes(d.value)
      ).map((d) => d.dayIndex);

      const dates: string[] = [];
      let currentCheck = baseDate;

      while (dates.length < occurrences) {
        if (targetDayIndices.includes(currentCheck.getDay())) {
          dates.push(format(currentCheck, 'yyyy-MM-dd'));
        }
        currentCheck = addDays(currentCheck, 1);
      }

      return dates;
    }

    return [startDate];
  }, [
    initialData?.id,
    scheduleMode,
    startDate,
    occurrences,
    intervalValue,
    intervalUnit,
    selectedDays,
  ]);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (initialData?.id) {
        // Single Edit Mode
        const updatePayload = {
          animal_id: targetAnimalId,
          food_type: foodType,
          quantity,
          quantity_unit: quantityUnit,
          scheduled_date: startDate,
          presentation_method: presentationMethod || null,
          supplements: supplements || null,
          calci_dust: calciDust,
          requires_calcidust: calciDust,
          notes: notes || null,
          schedule_mode: scheduleMode,
          selected_days: scheduleMode === 'CUSTOM_DAYS' ? selectedDays : null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('feeding_schedules')
          .update(updatePayload)
          .eq('id', initialData.id);

        if (error) throw error;
        return;
      }

      // Multi-Date Generator Projection (Option A)
      const scheduleRecords: CreateFeedingScheduleInput[] = projectedDates.map((dateStr) => ({
        animal_id: targetAnimalId,
        scheduled_date: dateStr,
        food_type: foodType,
        quantity,
        quantity_unit: quantityUnit,
        presentation_method: presentationMethod || null,
        supplements: supplements || null,
        calci_dust: calciDust,
        requires_calcidust: calciDust,
        notes: notes || null,
        schedule_mode: scheduleMode,
        selected_days: scheduleMode === 'CUSTOM_DAYS' ? selectedDays : null,
        status: 'PENDING',
        created_by: user?.id || null,
      }));

      await scheduledFeedingService.bulkCreateSchedules(scheduleRecords, user?.id);
    },
    onSuccess: () => {
      toast.success(
        initialData?.id
          ? 'Feeding schedule updated.'
          : `Generated ${projectedDates.length} schedule dates successfully.`
      );
      queryClient.invalidateQueries({ queryKey: ['feeding_schedules'] });
      queryClient.invalidateQueries({ queryKey: ['daily_logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'next_feeds'] });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(`Failed to save schedule: ${err.message}`);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!targetAnimalId) {
      toast.error('Animal ID is required to schedule feeding.');
      return;
    }
    if (!foodType.trim()) {
      toast.error('Food type is required.');
      return;
    }
    if (projectedDates.length === 0) {
      toast.error('No valid schedule dates generated. Please select days or interval.');
      return;
    }
    scheduleMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] font-sans">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
            <Utensils size={15} className="text-slate-700" />
            {initialData ? 'Edit Feeding Schedule' : 'Schedule Diets (Multi-Date Generator)'}
            {animal?.name && <span className="text-emerald-600">— {animal.name}</span>}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs font-medium">
          {/* Recurrence Mode Selector */}
          {!initialData && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Recurrence Pattern
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['SINGLE', 'DAILY', 'INTERVAL', 'CUSTOM_DAYS'] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setScheduleMode(mode)}
                    className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                      scheduleMode === mode
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {mode === 'SINGLE'
                      ? 'One-Off'
                      : mode === 'INTERVAL'
                        ? 'Interval'
                        : mode.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Interval Engine Controls */}
          {scheduleMode === 'INTERVAL' && !initialData && (
            <div className="p-3 bg-emerald-50/50 border border-emerald-200/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 flex items-center gap-1.5">
                  <RefreshCw size={12} className="text-emerald-600" />
                  Irregular Exotic Interval
                </span>
                <span className="text-[9px] font-bold text-emerald-700 font-mono">
                  Every {intervalValue} {intervalUnit}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Every
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Unit
                  </label>
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value as 'days' | 'weeks')}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 outline-none cursor-pointer"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Occurrences
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={occurrences}
                    onChange={(e) => setOccurrences(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Custom Days Matrix */}
          {scheduleMode === 'CUSTOM_DAYS' && !initialData && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Select Active Days
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Project Cycles:</span>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={occurrences}
                    onChange={(e) => setOccurrences(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                    className="w-14 p-1 bg-white border border-slate-200 rounded font-bold text-center text-slate-900 text-[10px]"
                  />
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {DAYS_OF_WEEK.map((d) => {
                  const isSelected = selectedDays.includes(d.value);
                  return (
                    <button
                      type="button"
                      key={d.value}
                      onClick={() => toggleDay(d.value)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily Projection Count */}
          {scheduleMode === 'DAILY' && !initialData && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                Projected Consecutive Days
              </span>
              <input
                type="number"
                min="1"
                max="90"
                value={occurrences}
                onChange={(e) => setOccurrences(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                className="w-20 p-1.5 bg-white border border-slate-200 rounded-lg font-bold text-center text-slate-900 text-xs"
              />
            </div>
          )}

          {/* Core Diet Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                {scheduleMode === 'SINGLE' ? 'Scheduled Date *' : 'Start Date *'}
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Quantity *
              </label>
              <input
                type="number"
                min="0.1"
                step="any"
                required
                value={quantity}
                onChange={(e) => setQuantity(Number.parseFloat(e.target.value) || 1)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Food Type *
              </label>
              <input
                type="text"
                required
                list="schedule_food_types"
                placeholder="e.g. Medium Rat / Quail"
                value={foodType}
                onChange={(e) => setFoodType(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
              />
              <datalist id="schedule_food_types">
                {foodOptions.map((f: string) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Unit
              </label>
              <select
                value={quantityUnit}
                onChange={(e) => setQuantityUnit(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none cursor-pointer"
              >
                <option value="whole_item">whole_item (x)</option>
                <option value="grams">grams (g)</option>
                <option value="item">item</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Supplements (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Nutrobal / Avipro"
                value={supplements}
                onChange={(e) => setSupplements(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Presentation Method
              </label>
              <input
                type="text"
                list="schedule_methods"
                placeholder="e.g. Tong Feed / Scatter"
                value={presentationMethod}
                onChange={(e) => setPresentationMethod(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
              />
              <datalist id="schedule_methods">
                {methodOptions.map((m: string) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          {/* CalciDust Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="schedule_calci_dust"
              checked={calciDust}
              onChange={(e) => setCalciDust(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4 cursor-pointer"
            />
            <label
              htmlFor="schedule_calci_dust"
              className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1"
            >
              <Sparkles size={13} className="text-amber-500" />
              Requires CalciDust / Dietary Calcium
            </label>
          </div>

          {/* Husbandry Notes */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
              Dietary Instructions / Fasting Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Offer warm prey in dark hide, remove after 20 mins if uneaten..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:ring-2 focus:ring-slate-900 outline-none resize-none"
            />
          </div>

          {/* Date Projection Verification Box */}
          {projectedDates.length > 1 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <Calendar size={11} className="text-slate-400" />
                Projected Calendar Dates ({projectedDates.length} instances):
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                {projectedDates.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-700"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl uppercase tracking-widest cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduleMutation.isPending}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50 flex items-center gap-2 shadow-sm cursor-pointer active:scale-95 transition-all"
            >
              {scheduleMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              <span>
                {initialData
                  ? 'Update Schedule'
                  : `Save Schedule (${projectedDates.length})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FeedingScheduleModal;