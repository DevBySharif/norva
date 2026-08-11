"use client";
import { useRef } from "react";
import { OptionInput } from "@/features/products/variant-combinations";

import type { Dispatch, SetStateAction } from "react";

type Props = {
  options: OptionInput[];
  onChange: Dispatch<SetStateAction<OptionInput[]>>;
};

export function OptionsBuilder({ options, onChange }: Props) {
  const newOptionRef = useRef<HTMLInputElement>(null);

  const addOption = () => {
    const name = newOptionRef.current?.value.trim();
    if (!name) return;
    onChange(prev => {
      if (prev.length >= 4) { alert("Maximum 4 option groups allowed."); return prev; }
      if (prev.some(o => o.name.toLowerCase() === name.toLowerCase())) { alert("Option name must be unique."); return prev; }
      return [...prev, { id: crypto.randomUUID(), name, values: [] }];
    });
    if (newOptionRef.current) newOptionRef.current.value = "";
  };

  const removeOption = (id: string) => {
    onChange(prev => prev.filter(o => o.id !== id));
  };

  const moveOption = (index: number, dir: number) => {
    onChange(prev => {
      const newOptions = [...prev];
      const temp = newOptions[index];
      newOptions[index] = newOptions[index + dir];
      newOptions[index + dir] = temp;
      return newOptions;
    });
  };

  const addValue = (optionId: string, valueName: string) => {
    const val = valueName.trim();
    if (!val) return;
    onChange(prev => {
      const optionIndex = prev.findIndex(o => o.id === optionId);
      if (optionIndex === -1) return prev;
      const option = prev[optionIndex];
      if (option.values.length >= 20) { alert("Maximum 20 values per option."); return prev; }
      if (option.values.some(v => v.value.toLowerCase() === val.toLowerCase())) { alert("Option value must be unique within group."); return prev; }
      
      const newOptions = [...prev];
      newOptions[optionIndex] = {
        ...option,
        values: [...option.values, { id: crypto.randomUUID(), value: val }]
      };
      return newOptions;
    });
  };

  const removeValue = (optionId: string, valueId: string) => {
    onChange(prev => prev.map(o => {
      if (o.id === optionId) {
        return { ...o, values: o.values.filter(v => v.id !== valueId) };
      }
      return o;
    }));
  };

  const moveValue = (optionId: string, index: number, dir: number) => {
    onChange(prev => prev.map(o => {
      if (o.id === optionId) {
        const values = [...o.values];
        const temp = values[index];
        values[index] = values[index + dir];
        values[index + dir] = temp;
        return { ...o, values };
      }
      return o;
    }));
  };

  const newValuesRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleAddValue = (optionId: string) => {
    const input = newValuesRefs.current[optionId];
    const val = input?.value;
    if (val) {
      addValue(optionId, val);
      if (input) input.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {options.map((option, oIdx) => (
        <div key={option.id} className="rounded-lg border border-[#d8d0c3] p-4 bg-white/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#8b5946]">{option.name}</h3>
            <div className="flex gap-2 text-sm">
              <button type="button" onClick={() => moveOption(oIdx, -1)} disabled={oIdx === 0} className="disabled:opacity-30 hover:text-[#D57959]">↑</button>
              <button type="button" onClick={() => moveOption(oIdx, 1)} disabled={oIdx === options.length - 1} className="disabled:opacity-30 hover:text-[#D57959]">↓</button>
              <button type="button" onClick={() => removeOption(option.id)} className="text-red-600 hover:underline" aria-label="Remove option">Remove</button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {option.values.map((v, vIdx) => (
              <div key={v.id} className="flex items-center gap-1 bg-[#F0EEE6] rounded-full px-3 py-1 text-sm border border-[#d8d0c3]">
                <span>{v.value}</span>
                <button type="button" onClick={() => moveValue(option.id, vIdx, -1)} disabled={vIdx === 0} className="disabled:opacity-30 ml-1 text-xs hover:text-[#D57959]">‹</button>
                <button type="button" onClick={() => moveValue(option.id, vIdx, 1)} disabled={vIdx === option.values.length - 1} className="disabled:opacity-30 text-xs hover:text-[#D57959]">›</button>
                <button type="button" onClick={() => removeValue(option.id, v.id)} className="ml-1 text-red-500 hover:text-red-700 font-bold">×</button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input ref={el => { newValuesRefs.current[option.id] = el; }} placeholder="New value..." className="catalog-field w-48 text-sm py-1" onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddValue(option.id);
              }
            }} />
            <button type="button" onClick={() => handleAddValue(option.id)} className="catalog-secondary-button text-sm py-1">Add value</button>
          </div>
        </div>
      ))}
      
      {options.length < 4 && (
        <div className="flex gap-2">
          <input ref={newOptionRef} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} placeholder="Option group name (e.g., Color)" className="catalog-field w-64 text-sm py-1" />
          <button type="button" onClick={addOption} className="catalog-secondary-button text-sm py-1">Add option group</button>
        </div>
      )}
    </div>
  );
}
