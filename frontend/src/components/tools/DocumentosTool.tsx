// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React from 'react';
import Documents from '@/pages/Documents';
import type { ToolProps } from '@/pages/ToolsHub';

export default function DocumentosTool({ onBack }: ToolProps) {
  return <Documents standalone onBack={onBack} />;
}
