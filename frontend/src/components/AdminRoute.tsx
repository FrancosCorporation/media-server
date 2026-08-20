// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const location = useLocation();
  const [authState, setAuthState] = useState<'loading' | 'admin' | 'not_admin'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/auth/me', { skipAuthRedirect: true });
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            if (data.role === 'admin') {
              setAuthState('admin');
            } else {
              setAuthState('not_admin');
            }
          } else {
            setAuthState('not_admin');
          }
        }
      } catch {
        if (!cancelled) setAuthState('not_admin');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D1117]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (authState === 'not_admin') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
