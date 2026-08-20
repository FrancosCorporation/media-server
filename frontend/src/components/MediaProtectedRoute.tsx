// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface MediaProtectedRouteProps {
  children: React.ReactNode;
}

const MediaProtectedRoute: React.FC<MediaProtectedRouteProps> = ({ children }) => {
  const location = useLocation();

  const isAuthenticated = useMemo(() => {
    const token = localStorage.getItem('media_token');
    if (!token) return false;

    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) {
        localStorage.removeItem('media_token');
        localStorage.removeItem('media_user');
        return false;
      }

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const binaryString = atob(base64 + padding);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const payload = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      const currentTime = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp > currentTime) {
        return true;
      }
      localStorage.removeItem('media_token');
      localStorage.removeItem('media_user');
      return false;
    } catch {
      localStorage.removeItem('media_token');
      localStorage.removeItem('media_user');
      return false;
    }
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/dolfimflix/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default MediaProtectedRoute;
