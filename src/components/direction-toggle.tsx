"use client";

interface DirectionToggleProps {
  options: [string, string];
  value: string;
  onChange: (value: string) => void;
}

export default function DirectionToggle({ options, value, onChange }: DirectionToggleProps) {
  return (
    <div className="flex rounded-full bg-slate-100 p-0.5">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
            value === option ? "bg-slate-800 text-white" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
