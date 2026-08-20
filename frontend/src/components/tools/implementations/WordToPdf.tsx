// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { createDocumentConverter } from './documentConverterTool';

export default createDocumentConverter({
  id: 'word-to-pdf',
  title: 'Word para PDF',
  description: 'Transforme arquivos .docx em PDFs profissionais.',
  endpoint: '/documents/word-to-pdf',
  accept: '.docx',
  outputExt: '.pdf',
  accent: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    gradient: 'from-red-600 to-rose-600',
  },
});
