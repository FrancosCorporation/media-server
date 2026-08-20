// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import {
  Search, X, ChevronRight, Type, CaseSensitive, FileText, SplitSquareHorizontal,
  List, Image, Move, Shrink, Palette, Droplets, Code, Key, Shield, Globe,
  Calculator, Percent, Hash, MessageSquare, Music, Mic, QrCode, Disc3, Dna,
  Timer, Activity, DollarSign, Ruler, BarChart3, SearchSlash, Link, FileSpreadsheet,
  FileCode2, Slash, LayoutGrid, Waves, Ear, Home, File, Combine, Scissors,
  Download,
  Camera
} from 'lucide-react';
import { YoutubeIcon } from '@/components/tools/implementations/SocialIcons';
import { cn } from '@/lib/utils';
import { AdBanner } from '@/components/AdBanner';
import { AdSenseBanner } from '@/components/AdSenseBanner';

import ToolLayout from '@/components/tools/ToolLayout';
import CategoryFolder from '@/components/tools/CategoryFolder';
import CategoryModal from '@/components/tools/CategoryModal';

// ─── Tipos ──────────────────────────────────────────────────────
export interface ToolProps { onBack: () => void; }

type CategoryId = 'text' | 'image' | 'dev' | 'finance' | 'seo' | 'audio' | 'documents' | 'media';
type ToolComponent = React.LazyExoticComponent<React.ComponentType<ToolProps>>;
type ViewMode = 'folders' | 'category' | 'tool';

interface ToolDefinition {
  id: string; title: string; description: string; icon: React.ElementType;
  category: CategoryId; component: ToolComponent; isNew?: boolean;
}

interface Category {
  id: CategoryId;
  label: string;
  description: string;
  icon: React.ElementType;
}

// ─── Categorias (hierárquicas) ──────────────────────────────────
const CATEGORIES: Category[] = [
  { id: 'documents', label: 'Documentos', description: 'Conversão, edição e análise de documentos', icon: FileText },
  { id: 'text', label: 'Texto & Redação', description: 'Ferramentas para manipulação e análise de textos', icon: Type },
  { id: 'image', label: 'Imagens & Design', description: 'Edição, conversão e criação de imagens', icon: Image },
  { id: 'dev', label: 'Dev & Código', description: 'Utilitários para desenvolvimento web', icon: Code },
  { id: 'finance', label: 'Finanças & Matemática', description: 'Cálculos financeiros e matemáticos', icon: Calculator },
  { id: 'seo', label: 'SEO & Marketing', description: 'Otimização para mecanismos de busca', icon: Search },
  { id: 'audio', label: 'Áudio & Vídeo', description: 'Ferramentas de áudio com Web Audio API', icon: Music },
  { id: 'media', label: 'YouTube', description: 'Download, transcrição e conversão de vídeos do YouTube', icon: YoutubeIcon },
];

const CATEGORY_COLORS: Record<CategoryId, { bg: string; border: string; text: string }> = {
  text:   { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
  image:  { bg: 'bg-pink-500/10', border: 'border-pink-500/20', text: 'text-pink-400' },
  dev:    { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400' },
  finance:{ bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  seo:    { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
  audio:  { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
  documents: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400' },
  media: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
};

const CATEGORY_ICONS: Record<CategoryId, React.ElementType> & { media: React.ElementType } = {
  text: Type,
  image: Palette,
  dev: Code,
  finance: DollarSign,
  seo: Globe,
  audio: Music,
  documents: FileText,
  media: YoutubeIcon,
};

// ─── Import de todas as 40 ferramentas ──────────────────────────
const TOOLS: ToolDefinition[] = [
  // ── Texto & Redação (7 ferramentas) ──
  { id: 'char-counter', title: 'Contador de Caract.', description: 'Conte palavras, caracteres e estime tempo de leitura.', icon: Type, category: 'text',
    component: lazy(() => import('@/components/tools/CounterTool')) },
  { id: 'case-converter', title: 'Conversor de Case', description: 'Transforme textos entre maiúsculas, minúsculas, título e mais.', icon: CaseSensitive, category: 'text',
    component: lazy(() => import('@/components/tools/CaseConverter')) },
  { id: 'lorem-ipsum', title: 'Gerador de Lorem Ipsum', description: 'Gere textos falsos para preencher layouts.', icon: FileText, category: 'text',
    component: lazy(() => import('@/components/tools/LoremIpsum')) },
  { id: 'diff-checker', title: 'Comparador de Textos', description: 'Compare textos lado a lado e veja diferenças.', icon: SplitSquareHorizontal, category: 'text',
    component: lazy(() => import('@/components/tools/DiffChecker')) },
  { id: 'list-organizer', title: 'Organizador de Listas', description: 'Remova duplicatas, ordene e numere listas.', icon: List, category: 'text',
    component: lazy(() => import('@/components/tools/ListOrganizer')) },
  { id: 'find-replace', title: 'Localizador e Substituidor', description: 'Busque e substitua palavras em massa no texto.', icon: SearchSlash, category: 'text',
    component: lazy(() => import('@/components/tools/implementations/FindReplace')) },
  { id: 'space-remover', title: 'Removedor de Espaços', description: 'Limpe espaços extras, tabulações e linhas em branco.', icon: Slash, category: 'text',
    component: lazy(() => import('@/components/tools/implementations/SpaceRemover')) },

  // ── Imagens & Design (7 ferramentas) ──
  { id: 'image-converter', title: 'Conversor de Imagem', description: 'Converta entre PNG, JPEG e WebP no navegador.', icon: Image, category: 'image',
    component: lazy(() => import('@/components/tools/ImageConverter')) },
  { id: 'image-resizer', title: 'Redimensionar Imagem', description: 'Redimensione imagens mantendo proporção.', icon: Move, category: 'image',
    component: lazy(() => import('@/components/tools/ImageResizer')) },
  { id: 'image-compressor', title: 'Compactador de Imagens', description: 'Comprima imagens ajustando a qualidade.', icon: Shrink, category: 'image',
    component: lazy(() => import('@/components/tools/ImageCompressor')) },
  { id: 'color-picker', title: 'Seletor de Cores', description: 'Descubra códigos HEX, RGB e HSL de qualquer cor.', icon: Palette, category: 'image',
    component: lazy(() => import('@/components/tools/ColorPicker')) },
  { id: 'color-palette', title: 'Paleta de Cores', description: 'Extraia as cores dominantes de uma imagem.', icon: Droplets, category: 'image',
    component: lazy(() => import('@/components/tools/ColorPalette')) },
  { id: 'qr-code', title: 'QR Code Generator', description: 'Crie QR Codes personalizados para links ou senhas WiFi.', icon: QrCode, category: 'image',
    component: lazy(() => import('@/components/tools/implementations/QrCodeGenerator')) },
  { id: 'css-gradient', title: 'Gerador de Gradientes', description: 'Crie gradientes CSS com preview em tempo real.', icon: Disc3, category: 'image',
    component: lazy(() => import('@/components/tools/implementations/CssGradientGenerator')) },
  { id: 'invert-image', title: 'Inverter Cores', description: 'Inverta as cores de uma imagem (efeito negativo).', icon: Image, category: 'image', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/InvertImage')) },
  { id: 'text-to-image', title: 'Texto para Imagem', description: 'Renderize texto como imagem PNG personalizada.', icon: Image, category: 'image', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/TextToImage')) },
  { id: 'qr-reader', title: 'Leitor de QR Code', description: 'Leia QR Codes a partir de imagens.', icon: Camera, category: 'image', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/QrCodeReader')) },

  // ── Dev & Código (7 ferramentas) ──
  { id: 'json-formatter', title: 'Formatador JSON', description: 'Formate, valide e prettify códigos JSON.', icon: Code, category: 'dev',
    component: lazy(() => import('@/components/tools/JsonFormatter')) },
  { id: 'password-gen', title: 'Gerador de Senhas', description: 'Crie senhas seguras com parâmetros ajustáveis.', icon: Key, category: 'dev',
    component: lazy(() => import('@/components/tools/PasswordGenerator')) },
  { id: 'base64', title: 'Base64 Encode/Decode', description: 'Codifique e decodifique em Base64.', icon: Shield, category: 'dev',
    component: lazy(() => import('@/components/tools/Base64Tool')) },
  { id: 'dns-checker', title: 'Simulador HTTP/DNS', description: 'Simule headers HTTP e entenda status codes.', icon: Globe, category: 'dev',
    component: lazy(() => import('@/components/tools/DnsChecker')) },
  { id: 'epoch-converter', title: 'Conversor Epoch/Data', description: 'Converta timestamps Unix em datas e vice-versa.', icon: Timer, category: 'dev',
    component: lazy(() => import('@/components/tools/implementations/EpochConverter')) },
  { id: 'code-formatter', title: 'Formatador HTML/CSS/JS', description: 'Formate código desalinhado no navegador.', icon: FileCode2, category: 'dev',
    component: lazy(() => import('@/components/tools/implementations/CodeFormatter')) },
  { id: 'hash-generator', title: 'Gerador de Hash', description: 'Calcule MD5, SHA-256 e SHA-512 no navegador.', icon: Dna, category: 'dev',
    component: lazy(() => import('@/components/tools/implementations/HashGenerator')) },

  // ── Finanças & Matemática (7 ferramentas) ──
  { id: 'compound-interest', title: 'Juros Compostos', description: 'Simule juros compostos com aporte mensal.', icon: Calculator, category: 'finance',
    component: lazy(() => import('@/components/tools/CompoundInterest')) },
  { id: 'percentage', title: 'Calculadora de %', description: 'Resolva cálculos de porcentagem rápidos.', icon: Percent, category: 'finance',
    component: lazy(() => import('@/components/tools/PercentageCalc')) },
  { id: 'cpf-cnpj', title: 'CPF / CNPJ', description: 'Gere e valide CPF e CNPJ com dígitos verificadores.', icon: Hash, category: 'finance',
    component: lazy(() => import('@/components/tools/CpfCnpjTool')) },
  { id: 'unit-converter', title: 'Conversor de Unidades', description: 'Converta comprimento, peso, temperatura e dados.', icon: Ruler, category: 'finance',
    component: lazy(() => import('@/components/tools/implementations/UnitConverter')) },
  { id: 'loan-calc', title: 'Empréstimo SAC/Price', description: 'Simule parcelas fixas ou decrescentes.', icon: DollarSign, category: 'finance',
    component: lazy(() => import('@/components/tools/implementations/LoanCalculator')) },
  { id: 'bmi-calc', title: 'Calculadora de IMC', description: 'Avalie seu índice de massa corporal.', icon: Activity, category: 'finance',
    component: lazy(() => import('@/components/tools/implementations/BmiCalculator')) },
  { id: 'profit-margin', title: 'Margem de Lucro', description: 'Calcule markup e preço de venda ideal.', icon: BarChart3, category: 'finance',
    component: lazy(() => import('@/components/tools/implementations/ProfitMarginCalculator')) },

  // ── SEO & Marketing (7 ferramentas) ──
  { id: 'whatsapp-link', title: 'Link WhatsApp', description: 'Crie links diretos para WhatsApp.', icon: MessageSquare, category: 'seo',
    component: lazy(() => import('@/components/tools/WhatsAppLink')) },
  { id: 'keyword-density', title: 'Densidade de Palavras', description: 'Analise a frequência de palavras no texto.', icon: Search, category: 'seo',
    component: lazy(() => import('@/components/tools/implementations/KeywordDensity')) },
  { id: 'utm-generator', title: 'Gerador de UTM Links', description: 'Crie URLs parametrizadas para o Google Analytics.', icon: Link, category: 'seo',
    component: lazy(() => import('@/components/tools/implementations/UtmGenerator')) },
  { id: 'meta-checker', title: 'Meta Title/Description', description: 'Verifique tamanho de títulos e meta descrições.', icon: FileSpreadsheet, category: 'seo',
    component: lazy(() => import('@/components/tools/implementations/MetaChecker')) },
  { id: 'sitemap-gen', title: 'Gerador de Sitemap XML', description: 'Gere a estrutura XML do sitemap do seu site.', icon: FileCode2, category: 'seo',
    component: lazy(() => import('@/components/tools/implementations/SitemapGenerator')) },
  { id: 'robots-txt', title: 'Gerador de robots.txt', description: 'Crie regras para indexadores do Google, Bing e mais.', icon: LayoutGrid, category: 'seo',
    component: lazy(() => import('@/components/tools/implementations/RobotsTxtGenerator')) },
  { id: 'slug-converter', title: 'Conversor de Slug URL', description: 'Transforme títulos em URLs amigáveis.', icon: Slash, category: 'seo',
    component: lazy(() => import('@/components/tools/implementations/SlugConverter')) },

  // ── Documentos ──
  { id: 'pdf-to-word', title: 'PDF para Word', description: 'Converta PDF em .docx editável.', icon: FileText, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/PdfToWord')) },
  { id: 'word-to-pdf', title: 'Word para PDF', description: 'Transforme .docx em PDF profissional.', icon: File, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/WordToPdf')) },
  { id: 'merge-pdf', title: 'Mesclar PDFs', description: 'Agrupe múltiplos PDFs em um único documento.', icon: Combine, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/MergePdf')) },
  { id: 'split-pdf', title: 'Dividir PDF', description: 'Extraia páginas específicas ou divida um PDF.', icon: Scissors, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/SplitPdf')) },
  { id: 'qrcode', title: 'Gerador de QR Code', description: 'Crie QR Codes personalizados para links ou senhas WiFi.', icon: QrCode, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/QrCodeGenerator')) },
  { id: 'jpg-to-pdf', title: 'JPG/PNG para PDF', description: 'Converta imagens JPG ou PNG em PDF.', icon: Image, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/JpgToPdf')) },
  { id: 'pdf-to-jpg', title: 'PDF para JPG', description: 'Converta páginas de PDF em imagens JPG.', icon: Image, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/PdfToJpg')) },
  { id: 'pdf-to-text', title: 'PDF para Texto', description: 'Extraia texto de arquivos PDF.', icon: FileText, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/PdfToText')) },
  { id: 'txt-to-pdf', title: 'TXT para PDF', description: 'Converta texto simples em PDF.', icon: FileText, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/TxtToPdf')) },
  { id: 'txt-to-word', title: 'TXT para Word', description: 'Converta texto simples em .docx editável.', icon: FileText, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/TxtToWord')) },
  { id: 'html-to-pdf', title: 'HTML para PDF', description: 'Converta código HTML em PDF.', icon: FileCode2, category: 'documents', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/HtmlToPdf')) },

  // ── Áudio & Vídeo (5 ferramentas) ──
  { id: 'audio-converter', title: 'Conversor MP3/WAV', description: 'Converta áudios usando a Web Audio API.', icon: Music, category: 'audio',
    component: lazy(() => import('@/components/tools/AudioConverter')) },
  { id: 'voice-recorder', title: 'Gravador de Voz', description: 'Grave sua voz e baixe o áudio do navegador.', icon: Mic, category: 'audio',
    component: lazy(() => import('@/components/tools/VoiceRecorder')) },
  { id: 'freq-generator', title: 'Sintetizador de Som', description: 'Gere ondas senoidais, quadradas e serra em Hz.', icon: Waves, category: 'audio',
    component: lazy(() => import('@/components/tools/implementations/FrequencyGenerator')) },
  { id: 'metronome', title: 'Metrônomo Digital', description: 'Controle BPM com cliques sonoros e indicadores visuais.', icon: Ear, category: 'audio',
    component: lazy(() => import('@/components/tools/implementations/Metronome')) },
  { id: 'audio-extractor', title: 'Extrator de Áudio', description: 'Extraia a faixa de áudio de vídeos MP4.', icon: Music, category: 'audio',
    component: lazy(() => import('@/components/tools/implementations/AudioExtractor')) },

  // ── YouTube (1 ferramenta) ──
  { id: 'media-download-hub', title: 'YouTube Downloads & Transcrição', description: 'Baixe vídeos, áudios e extraia transcrições do YouTube, Instagram e TikTok.', icon: YoutubeIcon, category: 'media', isNew: true,
    component: lazy(() => import('@/components/tools/implementations/MediaDownloadHub')) },
];

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

/** Agrupa ferramentas por categoria */
function groupToolsByCategory(): Record<CategoryId, ToolDefinition[]> {
  const groups: Record<CategoryId, ToolDefinition[]> = {
    text: [], image: [], dev: [], finance: [], seo: [], audio: [], documents: [], media: [],
  };
  TOOLS.forEach((tool) => {
    groups[tool.category].push(tool);
  });
  return groups;
}

// ══════════════════════════════════════════════════════════════════
//  BACKGROUND (fora do componente para evitar recriação)
// ══════════════════════════════════════════════════════════════════
const Background = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:6rem_6rem]" />
    <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
    <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-pink-500/5 rounded-full blur-3xl" />
  </div>
);

// ══════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function ToolsHub() {
  const [viewMode, setViewMode] = useState<ViewMode>('folders');
  const [activeCategoryId, setActiveCategoryId] = useState<CategoryId | null>(null);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const toolsByCategory = useMemo(() => groupToolsByCategory(), []);

  // Filtragem global (na visão de pastas)
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return CATEGORIES;
    const q = searchQuery.toLowerCase();
    return CATEGORIES.filter((cat) => {
      const catMatch = cat.label.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q);
      const toolsMatch = toolsByCategory[cat.id].some(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
      return catMatch || toolsMatch;
    });
  }, [searchQuery, toolsByCategory]);

  // Categoria ativa
  const activeCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === activeCategoryId) || null,
    [activeCategoryId]
  );

  // Ferramenta ativa
  const activeTool = useMemo(
    () => TOOLS.find((t) => t.id === activeToolId) || null,
    [activeToolId]
  );

  // Handlers
  const handleOpenCategory = useCallback((id: string) => {
    setActiveCategoryId(id as CategoryId);
    setViewMode('category');
  }, []);

  const handleCloseCategory = useCallback(() => {
    setViewMode('folders');
    setActiveCategoryId(null);
  }, []);

  const handleOpenTool = useCallback((id: string) => {
    setActiveToolId(id);
    setViewMode('tool');
  }, []);

  const handleBackFromTool = useCallback(() => {
    setActiveToolId(null);
    setViewMode('category');
  }, []);

  // ─── Tela da ferramenta ativa ────────────────────────────────
  if (viewMode === 'tool' && activeTool && activeCategory) {
    const catColor = CATEGORY_COLORS[activeTool.category];
    const catLabel = activeCategory.label;
    const Icon = activeTool.icon;
    const ActiveComponent = activeTool.component;

    return (
      <ToolLayout
        title={activeTool.title}
        description={activeTool.description}
        icon={<Icon className={cn('w-5 h-5', catColor.text)} />}
        categoryLabel={catLabel}
        categoryColor={catColor}
        onBack={handleBackFromTool}
      >
        <Suspense fallback={
          <div className="flex justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <p className="text-sm text-[var(--wcag-text-secondary)]">Carregando ferramenta...</p>
            </div>
          </div>
        }>
          <ActiveComponent onBack={handleBackFromTool} />
        </Suspense>
      </ToolLayout>
    );
  }



  // ════════════════════════════════════════════════════════════════
  //  RETORNO PRINCIPAL
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="w-full max-w-full overflow-x-hidden min-h-screen bg-[#0D1117] text-[var(--wcag-text-primary)] pt-16 md:pt-20">
      <Background />

      {/* ─── Sidebar Esquerda (fixa, oculta no mobile) ── */}
      <aside className="hidden md:block fixed left-0 top-20 z-50">
        <AdSenseBanner
          adClient="ca-pub-7405286854348669"
          adSlot="1234567890"
          format="vertical"
          width={120}
          height={600}
          className="w-full"
        />
      </aside>

      {/* ─── Sidebar Direita (fixa, oculta no mobile) ── */}
      <aside className="hidden md:block fixed right-0 top-20 z-50">
        <AdSenseBanner
          adClient="ca-pub-7405286854348669"
          adSlot="1234567891"
          format="vertical"
          width={120}
          height={600}
          className="w-full"
        />
      </aside>

      {/* ─── Área Central (Conteúdo/Hub) ────────────────── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-[140px] py-10">
          {/* ────── HEADER ────── */}
          <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-xs font-medium mb-4">
            <ChevronRight className="w-3 h-3" />
            Hub de Utilidades
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-violet-400 via-green-400 to-pink-400 bg-clip-text text-transparent">
              FrancoTools
            </span>
          </h1>
          <p className="text-[var(--wcag-text-secondary)] text-lg max-w-3xl mx-auto leading-relaxed">
            <strong className="text-[var(--wcag-text-primary)]">51 ferramentas gratuitas</strong> que rodam 100% no seu navegador.
            Navegue pelas <strong className="text-primary-light">categorias</strong> abaixo.
          </p>
        </div>

        {/* ────── SEARCH (global) ────── */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--wcag-text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar ferramentas ou categorias..."
              className={cn(
                'w-full pl-12 pr-10 py-3.5 rounded-2xl text-sm transition-all duration-200',
                'bg-white/[0.04] border border-white/[0.08]',
                'text-[var(--wcag-text-primary)] placeholder:text-[var(--wcag-text-placeholder)]',
                'outline-none focus:border-primary/50 focus:bg-white/[0.06]'
              )}
              aria-label="Buscar ferramentas"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={cn(
                  'absolute right-4 top-1/2 -translate-y-1/2 transition-colors',
                  'text-[var(--wcag-text-tertiary)] hover:text-[var(--wcag-text-primary)]'
                )}
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ────── BREADCRUMBS ────── */}
        {(viewMode === 'category' || viewMode === 'tool') && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm mb-6">
            <button
              onClick={() => {
                setViewMode('folders');
                setActiveCategoryId(null);
                setActiveToolId(null);
              }}
              className={cn(
                'flex items-center gap-1.5 transition-colors duration-200',
                'text-[var(--wcag-text-tertiary)] hover:text-[var(--wcag-text-primary)]'
              )}
              aria-label="Voltar para categorias"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Categorias</span>
            </button>
            {activeCategory && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--wcag-text-placeholder)]" aria-hidden="true" />
                <span
                  className="font-medium text-[var(--wcag-text-secondary)]"
                  aria-current={viewMode === 'category' ? 'page' : undefined}
                >
                  {activeCategory.label}
                </span>
                {activeTool && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--wcag-text-placeholder)]" aria-hidden="true" />
                    <span
                      className="text-[var(--wcag-text-tertiary)] truncate max-w-[200px]"
                      aria-current="page"
                    >
                      {activeTool.title}
                    </span>
                  </>
                )}
              </>
            )}
          </nav>
        )}

        {/* ────── VIEW: Category Tools ────── */}
        {viewMode === 'category' && activeCategory && (
          <CategoryModal
            category={{
              id: activeCategory.id,
              label: activeCategory.label,
              color: CATEGORY_COLORS[activeCategory.id],
              icon: (() => { const CatIconComp = CATEGORY_ICONS[activeCategory.id]; return <CatIconComp className={cn('w-5 h-5', CATEGORY_COLORS[activeCategory.id].text)} />; })(),
            }}
            tools={toolsByCategory[activeCategory.id].map((tool) => ({
              id: tool.id,
              title: tool.title,
              description: tool.description,
              icon: <tool.icon className={cn('w-5 h-5', CATEGORY_COLORS[tool.category].text)} />,
              category: tool.category,
              categoryLabel: activeCategory.label,
              categoryColor: CATEGORY_COLORS[tool.category],
            }))}
            onClose={handleCloseCategory}
            onOpenTool={handleOpenTool}
          />
        )}

        {/* ────── VIEW: Category Folders (main) ────── */}
        {viewMode === 'folders' && (
          <>
            {/* Grid de Pastas */}
            <div className="flex flex-wrap justify-center items-center gap-6 w-full mb-10">
              {filteredCategories.map((cat) => {
                const toolCount = toolsByCategory[cat.id]?.length || 0;
                const CatIcon = CATEGORY_ICONS[cat.id];
                const color = CATEGORY_COLORS[cat.id];
                const hasNewTools = toolsByCategory[cat.id]?.some((t) => t.isNew) || false;

                return (
                  <div key={cat.id} className="flex-[1_1_280px] max-w-[400px] min-w-[260px]">
                    <CategoryFolder
                      id={cat.id}
                      label={cat.label}
                      description={cat.description}
                      icon={<CatIcon className={cn('w-6 h-6', color.text)} />}
                      color={color}
                      toolCount={toolCount}
                      hasNew={hasNewTools}
                      onOpen={handleOpenCategory}
                    />
                  </div>
                );
              })}
            </div>

            {/* Nenhum resultado */}
            {filteredCategories.length === 0 && (
              <div className="text-center py-16">
                <Search className="w-12 h-12 text-[var(--wcag-text-tertiary)] mx-auto mb-4" />
                <p className="text-[var(--wcag-text-secondary)] text-lg mb-2">
                  Nenhum resultado para "<strong className="text-[var(--wcag-text-primary)]">{searchQuery}</strong>"
                </p>
                <p className="text-[var(--wcag-text-tertiary)] text-sm mb-6">
                  Tente buscar por nome de ferramenta ou categoria
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-primary-light hover:text-primary-light/80 hover:bg-primary/10 transition-all"
                >
                  Limpar busca
                </button>
              </div>
            )}

            {/* Rodapé */}
            <div className="text-center mb-6">
              <p className="text-xs text-[var(--wcag-text-placeholder)]">
                {TOOLS.length} ferramentas • Nenhum dado sai do seu navegador
              </p>
            </div>

            {/* Ad Banner */}
            <div className="w-full flex justify-center mt-12 mb-8">
              <AdBanner variant="leaderboard" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
