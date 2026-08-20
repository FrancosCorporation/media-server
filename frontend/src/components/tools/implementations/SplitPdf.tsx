// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { createDocumentConverter } from './documentConverterTool';

export default createDocumentConverter({
  id: 'split-pdf',
  title: 'Dividir PDF',
  description: 'Extraia páginas específicas ou divida um PDF em partes.',
  endpoint: '/documents/split-pdf',
  accept: '.pdf',
  outputExt: '.pdf',
  accent: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    gradient: 'from-orange-600 to-amber-600',
  },
});
