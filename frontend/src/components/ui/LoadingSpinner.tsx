// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'violet' | 'white' | 'muted';
  label?: string;
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

const variantMap = {
  violet: 'border-primary/30 border-t-primary',
  white: 'border-white/30 border-t-white',
  muted: 'border-[#A1A1AA]/30 border-t-[#A1A1AA]',
};

export function LoadingSpinner({
  size = 'md',
  variant = 'violet',
  label,
  className,
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn('flex flex-col items-center gap-3', className)}
      role="status"
      aria-label={label || 'Carregando...'}
    >
      <div
        className={cn(
          'rounded-full animate-spin',
          sizeMap[size],
          variantMap[variant]
        )}
      />
      {label && (
        <p className="text-sm text-[#A1A1AA]">{label}</p>
      )}
    </div>
  );
}

// Full page loading overlay
export function PageLoading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
      <LoadingSpinner size="lg" variant="violet" label={label} />
    </div>
  );
}
