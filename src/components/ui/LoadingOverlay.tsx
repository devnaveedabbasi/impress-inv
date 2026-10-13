interface LoadingOverlayProps {
  text?: string;
}

export function LoadingOverlay({ text = "Loading data..." }: LoadingOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-white/60 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-md bg-white/80 px-3 py-2 text-xs text-zinc-600 shadow-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-primary-500" aria-hidden />
        <span>{text}</span>
      </div>
    </div>
  );
}
