import { InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface LabeledFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  wrapperClassName?: string;
  loading?: boolean;
}

export const LabeledField = forwardRef<HTMLInputElement, LabeledFieldProps>(function LabeledField(
  { label, error, className, wrapperClassName, loading, id, disabled, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn("w-full", wrapperClassName)}>
      <label htmlFor={inputId} className="mb-1 block text-sm text-zinc-600">
        {label}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          disabled={disabled || loading}
          aria-invalid={!!error}
          className={cn(
            "w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary-400 disabled:bg-zinc-50 disabled:text-zinc-400",
            error ? "border-red-400" : "border-zinc-300",
            loading && "pr-9", // spinner ke liye right padding
            className
          )}
          {...props}
        />

        {loading && (
          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xs text-zinc-400">

            loading...
            {/* <svg
              className="h-3.5 w-3.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg> */}
          </span>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});