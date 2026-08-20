// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
  onBack?: () => void;
  fallbackTo?: string;
  className?: string;
}

export default function BackButton({ onBack, fallbackTo = '/', className = '' }: BackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallbackTo);
    }
  };

  return (
    <button
      onClick={handleBack}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-[#A1A1AA] hover:text-white ${className}`}
    >
      <ArrowLeft className="w-5 h-5" />
      <span className="text-sm font-medium">Voltar</span>
    </button>
  );
}
