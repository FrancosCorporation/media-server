// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiBase } from '../lib/api';
import { Users, Mail, Calendar, ArrowLeft, RefreshCw, Download, Phone } from 'lucide-react';

interface Lead {
  _id: string;
  name: string;
  email: string;
  interest: string;
  waitlistedAt: string;
  createdAt: string;
}

export default function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchLeads = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${apiBase()}/waitlist/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao carregar leads');
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar lista');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const exportCSV = () => {
    const header = 'Nome,Email,Interesse,Data\n';
    const rows = leads
      .map((l) => `"${l.name}","${l.email}","${l.interest}","${new Date(l.waitlistedAt).toLocaleDateString('pt-BR')}"`)
      .join('\n');
    const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1c]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d1524]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <Users size={22} className="text-primary" />
                AdminLeads
              </h1>
              <p className="text-sm text-gray-500">Gestão de leads — Fila de Espera</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {leads.length} lead{leads.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={exportCSV}
              disabled={leads.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              <Download size={16} />
              CSV
            </button>
            <button
              onClick={fetchLeads}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-gray-300 text-sm hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20">
            <Users size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">Nenhum lead na fila de espera ainda.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Nome</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">E-mail</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Interesse</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-400">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary text-sm font-medium">
                            {lead.name?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <span className="text-white">{lead.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`mailto:${lead.email}`}
                        className="text-gray-300 hover:text-primary transition-colors flex items-center gap-2"
                      >
                        <Mail size={14} className="text-gray-500" />
                        {lead.email}
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-white/5 text-gray-300">
                        <Phone size={12} className="text-gray-500" />
                        {lead.interest || 'Geral'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-400 text-sm flex items-center gap-2">
                        <Calendar size={14} className="text-gray-500" />
                        {new Date(lead.waitlistedAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
