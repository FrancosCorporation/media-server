// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState } from 'react';
import { Edit2, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface DataTableProps {
  data: Array<{
    id: number;
    name: string;
    email: string;
    status: 'ativo' | 'inativo' | 'pendente';
    lastOrder?: string;
    totalSpent?: string;
  }>;
}

export default function DataTable({ data }: DataTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Filtrar dados pela busca
  const filteredData = data.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Paginação
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  // Status colors
  const statusColors: Record<string, string> = {
    ativo: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    inativo: 'bg-red-500/20 text-red-400 border-red-500/30',
    pendente: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  return (
    <div className="space-y-4">
      {/* Header da Tabela */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white">Clientes</h2>

        {/* Barra de Busca */}
        <div className="relative w-full sm:w-72">
          <Search 
            size={16} 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" 
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Buscar clientes..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // Reset para primeira página ao buscar
            }}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0D1117] border border-white/5 text-sm text-white placeholder:text-[#6B7280]/50 focus:border-primary/50 outline-none transition-all duration-300"
            aria-label="Buscar clientes"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-[#0F172A]/50 backdrop-blur-sm rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" role="table">
            <thead className="border-b border-white/5 bg-[#0D1117]/50">
              <tr>
                <th scope="col" className="px-6 py-4 text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider">
                  Cliente
                </th>
                <th scope="col" className="px-6 py-4 text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider hidden md:table-cell">
                  Status
                </th>
                <th scope="col" className="px-6 py-4 text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider hidden lg:table-cell">
                  Última Compra
                </th>
                <th scope="col" className="px-6 py-4 text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider hidden xl:table-cell">
                  Total Gasto
                </th>
                <th scope="col" className="px-6 py-4 text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedData.length > 0 ? (
                paginatedData.map((item) => (
                  <tr 
                    key={item.id} 
                    role="row"
                    className="hover:bg-white/5 transition-colors duration-300 group"
                  >
                    {/* Nome e Email */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20 text-white font-medium text-sm">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.name}</p>
                          <p className="text-xs text-[#A1A1AA] truncate">{item.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span 
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[item.status]}`}
                      >
                        {item.status === 'ativo' && (
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-2 animate-pulse" />
                        )}
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </span>
                    </td>

                    {/* Última Compra */}
                    <td className="px-6 py-4 text-sm text-[#A1A1AA] hidden lg:table-cell">
                      {item.lastOrder || '-'}
                    </td>

                    {/* Total Gasto */}
                    <td className="px-6 py-4 text-sm font-medium text-white hidden xl:table-cell">
                      {item.totalSpent ? `R$ ${parseFloat(item.totalSpent).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                    </td>

                    {/* Ações */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 focus-within:opacity-100">
                        <button
                          onClick={() => alert(`Editar cliente: ${item.name}`)}
                          className="p-2 rounded-lg hover:bg-primary/20 text-[#A1A1AA] hover:text-primary-light transition-colors duration-300 focus-visible:outline-none focus-visible:bg-primary/20"
                          aria-label={`Editar ${item.name}`}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => alert(`Excluir cliente: ${item.name}`)}
                          className="p-2 rounded-lg hover:bg-red-500/20 text-[#A1A1AA] hover:text-red-400 transition-colors duration-300 focus-visible:outline-none focus-visible:bg-red-500/20"
                          aria-label={`Excluir ${item.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Search size={40} className="text-[#A1A1AA]/30" />
                      <p className="text-[#A1A1AA] text-sm">Nenhum cliente encontrado.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-[#0D1117]/30">
            <p className="text-sm text-[#A1A1AA]">
              Mostrando <span className="text-white font-medium">{startIndex + 1}</span> até{' '}
              <span className="text-white font-medium">{Math.min(startIndex + itemsPerPage, filteredData.length)}</span>{' '}
              de <span className="text-white font-medium">{filteredData.length}</span> resultados
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
                aria-label="Página anterior"
              >
                <ChevronLeft size={18} className="text-[#A1A1AA]" />
              </button>

              {/* Números de Página */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:bg-primary/20 ${
                    currentPage === page
                      ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-lg shadow-primary/20'
                      : 'text-[#A1A1AA] hover:bg-white/5'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors duration-300 focus-visible:outline-none focus-visible:bg-white/10"
                aria-label="Próxima página"
              >
                <ChevronRight size={18} className="text-[#A1A1AA]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
