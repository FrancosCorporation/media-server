// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 text-center',
        className
      )}
      role="status"
    >
      {Icon && (
        <Icon
          size={48}
          className="text-[#A1A1AA]/30 mb-4"
          aria-hidden="true"
        />
      )}
      <p className="text-[#A1A1AA] text-sm font-medium mb-1">{title}</p>
      {description && (
        <p className="text-[#6B7280] text-xs max-w-[240px]">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white text-sm font-medium transition-all duration-300 shadow-lg shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
