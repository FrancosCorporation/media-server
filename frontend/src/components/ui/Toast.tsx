// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useToast, type Toast } from '../../hooks/useToast';

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const stylesMap = {
  success: {
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    icon: 'text-emerald-400',
    title: 'text-emerald-300',
    message: 'text-emerald-400/80',
    hover: 'hover:bg-emerald-500/20',
  },
  error: {
    bg: 'bg-red-500/10 border-red-500/20',
    icon: 'text-red-400',
    title: 'text-red-300',
    message: 'text-red-400/80',
    hover: 'hover:bg-red-500/20',
  },
  warning: {
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    icon: 'text-yellow-400',
    title: 'text-yellow-300',
    message: 'text-yellow-400/80',
    hover: 'hover:bg-yellow-500/20',
  },
  info: {
    bg: 'bg-blue-500/10 border-blue-500/20',
    icon: 'text-blue-400',
    title: 'text-blue-300',
    message: 'text-blue-400/80',
    hover: 'hover:bg-blue-500/20',
  },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = iconMap[toast.type];
  const styles = stylesMap[toast.type];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`${styles.bg} border rounded-xl p-4 shadow-xl shadow-black/20 backdrop-blur-sm animate-fade-in min-w-[320px] max-w-[420px]`}
    >
      <div className="flex items-start gap-3">
        <Icon size={20} className={`${styles.icon} flex-shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${styles.title}`}>{toast.title}</p>
          {toast.message && (
            <p className={`text-xs mt-1 ${styles.message}`}>{toast.message}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded-lg ${styles.icon} opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20`}
          aria-label="Fechar notificação"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notificações"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onClose={() => removeToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}
