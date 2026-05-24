interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <input
      type="search"
      placeholder="Search presets…"
      className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
