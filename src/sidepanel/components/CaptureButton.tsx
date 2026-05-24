interface Props {
  onClick: () => void;
  busy?: boolean;
}

export function CaptureButton({ onClick, busy }: Props) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
      disabled={busy}
      onClick={onClick}
    >
      <span aria-hidden="true">📸</span>
      <span>{busy ? 'Capturing…' : 'Capture this page'}</span>
    </button>
  );
}
