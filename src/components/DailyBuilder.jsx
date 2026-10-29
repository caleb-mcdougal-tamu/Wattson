import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chips, Field, Segmented } from "@/components/Section";
import { DAY_SHORT, MONTH_SHORT, describeSelection } from "@/lib/demandAnalysis";

const DAY_OPTIONS = DAY_SHORT.map((label, value) => ({ label, value }));
const MONTH_OPTIONS = MONTH_SHORT.map((label, i) => ({ label, value: i + 1 }));
const DAY_PRESETS = [
  { label: "Weekdays", days: [0, 1, 2, 3, 4] },
  { label: "Weekends", days: [5, 6] },
  { label: "All", days: [0, 1, 2, 3, 4, 5, 6] },
];
const MONTH_PRESETS = [
  { label: "Summer (Jun–Aug)", months: [6, 7, 8] },
  { label: "Winter (Dec–Feb)", months: [12, 1, 2] },
  { label: "All", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort((a, b) => a - b));

function Presets({ items, onPick }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((p) => (
        <button key={p.label} type="button" onClick={() => onPick(p)} className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">
          {p.label}
        </button>
      ))}
    </div>
  );
}

// The Python tool's daily_demand_anaylsis(), with its arguments chosen in the UI.
export default function DailyBuilder({ onAdd }) {
  const [days, setDays] = useState([0, 1, 2, 3, 4]);
  const [months, setMonths] = useState([6, 7, 8]);
  const [averageDays, setAverageDays] = useState(true);
  const [tail, setTail] = useState("");

  const auto = days.length && months.length ? describeSelection(days, months) : "";
  const ready = days.length > 0 && months.length > 0;

  return (
    <div className="space-y-4">
      <Field label="Days of the week">
        <Chips options={DAY_OPTIONS} selected={days} onToggle={(v) => setDays((d) => toggleIn(d, v))} />
        <Presets items={DAY_PRESETS} onPick={(p) => setDays(p.days)} />
      </Field>
      <Field label="Months">
        <Chips options={MONTH_OPTIONS} selected={months} onToggle={(v) => setMonths((m) => toggleIn(m, v))} />
        <Presets items={MONTH_PRESETS} onPick={(p) => setMonths(p.months)} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Plot">
          <Segmented
            value={averageDays}
            onChange={setAverageDays}
            options={[
              { value: true, label: "One averaged plot" },
              { value: false, label: "One per day" },
            ]}
          />
        </Field>
      </div>
      <Field label="Title ending" hint={`Leave blank to use “${auto || "…"}”.`}>
        <Input value={tail} onChange={(e) => setTail(e.target.value)} placeholder={auto} />
      </Field>
      <Button
        disabled={!ready}
        onClick={() => onAdd({ daysToPlot: days, monthsToPlot: months, averageDays, titleTail: tail.trim() || auto })}
        className="w-full sm:w-auto"
      >
        <Plus /> Add plot
      </Button>
    </div>
  );
}
