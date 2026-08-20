// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import { cn } from '@/lib/utils';

export interface Category {
  id: string;
  label: string;
}

interface CategoryFilterProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (id: string) => void;
}

export default function CategoryFilter({ categories, activeCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-10">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onCategoryChange(cat.id)}
          data-selected={activeCategory === cat.id || undefined}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-medium transition-all',
            'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white',
            'data-[selected=true]:bg-primary data-[selected=true]:border-primary data-[selected=true]:text-white'
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
