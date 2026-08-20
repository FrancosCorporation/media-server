// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { createDocumentConverter } from './documentConverterTool';

export default createDocumentConverter({
  id: 'pdf-to-word',
  title: 'PDF para Word',
  description: 'Converta seus arquivos PDF em documentos .docx editáveis.',
  endpoint: '/documents/pdf-to-word',
  accept: '.pdf',
  outputExt: '.docx',
  accent: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    gradient: 'from-blue-600 to-indigo-600',
  },
});
