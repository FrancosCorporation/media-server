// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface UseHierarchicalBackspaceOptions {
  onBack?: () => void;
  active?: boolean;
}

export function useHierarchicalBackspace(options?: UseHierarchicalBackspaceOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const { onBack, active } = options ?? {};

  useEffect(() => {
    if (active === false) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target.isContentEditable) return;

      if (event.key === 'Backspace') {
        event.preventDefault();

        if (onBack) {
          onBack();
          return;
        }

        const parts = location.pathname.split('/').filter(Boolean);
        if (parts.length === 0) return;

        parts.pop();
        const parentPath = '/' + parts.join('/');
        navigate(parentPath || '/');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, location.pathname, onBack, active]);
}
