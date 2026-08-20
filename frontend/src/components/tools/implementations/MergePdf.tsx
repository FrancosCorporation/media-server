// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { createDocumentConverter } from './documentConverterTool';

export default createDocumentConverter({
  id: 'merge-pdf',
  title: 'Mesclar PDFs',
  description: 'Agrupe múltiplos PDFs em um único documento.',
  endpoint: '/documents/merge-pdf',
  accept: '.pdf',
  outputExt: '.pdf',
  multiple: true,
  minFiles: 2,
  accent: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
    gradient: 'from-purple-600 to-violet-600',
  },
});
