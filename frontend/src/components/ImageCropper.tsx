// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Check, X, Crop } from 'lucide-react';

interface ImageCropperProps {
  imageUrl: string;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}

const CROP_SIZE = 400;

export default function ImageCropper({ imageUrl, onCrop, onCancel }: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, posX: 0, posY: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  // When image loads, calculate initial zoom and position (cover fit)
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      setImgDimensions({ width: naturalWidth, height: naturalHeight });

      // Initial zoom: cover the crop area (minimum dimension fills the crop)
      const scaleX = CROP_SIZE / naturalWidth;
      const scaleY = CROP_SIZE / naturalHeight;
      const initialZoom = Math.max(scaleX, scaleY);

      setZoom(initialZoom);
      setPosition({ x: 0, y: 0 });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Clamp position so image stays within crop area
  const clampPosition = useCallback((pos: { x: number; y: number }, currentZoom: number) => {
    const scaledW = imgDimensions.width * currentZoom;
    const scaledH = imgDimensions.height * currentZoom;

    const maxX = Math.max(0, (scaledW - CROP_SIZE) / 2);
    const maxY = Math.max(0, (scaledH - CROP_SIZE) / 2);

    return {
      x: Math.max(-maxX, Math.min(maxX, pos.x)),
      y: Math.max(-maxY, Math.min(maxY, pos.y)),
    };
  }, [imgDimensions]);

  // Mouse handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, posX: position.x, posY: position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const newPos = clampPosition(
      { x: dragStart.posX + dx, y: dragStart.posY + dy },
      zoom
    );
    setPosition(newPos);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      posX: position.x,
      posY: position.y,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.x;
    const dy = e.touches[0].clientY - dragStart.y;
    const newPos = clampPosition(
      { x: dragStart.posX + dx, y: dragStart.posY + dy },
      zoom
    );
    setPosition(newPos);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Wheel handler: usa listener nativo com passive:false para evitar warning
  // do React sobre 'Unable to preventDefault inside passive event listener'
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(5, zoom * delta));
      setZoom(newZoom);
      setPosition((prev) => clampPosition(prev, newZoom));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, clampPosition]);

  // Zoom controls
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 5);
    setZoom(newZoom);
    setPosition(clampPosition(position, newZoom));
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.2);
    setZoom(newZoom);
    setPosition(clampPosition(position, newZoom));
  };

  // Export cropped image as WebP blob with JPEG fallback
  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        setIsProcessing(false);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;

      ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

      // Draw the cropped portion using the current crop position/zoom
      const img = new Image();
      img.src = imageUrl;

      await new Promise<void>((resolve) => {
        img.onload = () => {
          const sourceSize = CROP_SIZE / zoom;
          const centerX = imgDimensions.width / 2;
          const centerY = imgDimensions.height / 2;

          const sourceX = centerX - sourceSize / 2 - position.x / zoom;
          const sourceY = centerY - sourceSize / 2 - position.y / zoom;

          ctx.drawImage(
            img,
            sourceX, sourceY, sourceSize, sourceSize,
            0, 0, CROP_SIZE, CROP_SIZE
          );
          resolve();
        };
        img.onerror = () => resolve(); // Garante que nao trava se a imagem falhar
      });

      // Try WebP first, fallback to JPEG if browser doesn't support it
      canvas.toBlob((blob) => {
        if (blob) {
          onCrop(blob);
          setIsProcessing(false);
        } else {
          // Fallback: WebP not supported, try JPEG
          canvas.toBlob((fallbackBlob) => {
            if (fallbackBlob) {
              onCrop(fallbackBlob);
            }
            setIsProcessing(false);
          }, 'image/jpeg', 0.92);
        }
      }, 'image/webp', 0.85);
    } catch (err) {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Crop size={18} className="text-primary-light" />
            <h3 className="text-lg font-semibold text-white">Ajustar Foto</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-white/5 text-[#A1A1AA] hover:text-white transition-colors"
            disabled={isProcessing}
          >
            <X size={18} />
          </button>
        </div>

        {/* Crop Area */}
        <div className="p-6">
          <div className="flex items-center justify-center">
            <div
              ref={containerRef}
              className="relative overflow-hidden rounded-xl bg-[#0D1117] border border-white/5"
              style={{ width: CROP_SIZE, height: CROP_SIZE }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Crop preview"
                className="absolute max-w-none pointer-events-none select-none"
                style={{
                  width: imgDimensions.width * zoom,
                  height: imgDimensions.height * zoom,
                  left: `calc(50% - ${(imgDimensions.width * zoom) / 2}px + ${position.x}px)`,
                  top: `calc(50% - ${(imgDimensions.height * zoom) / 2}px + ${position.y}px)`,
                  cursor: isDragging ? 'grabbing' : 'grab',
                }}
                draggable={false}
              />

              {/* Grid overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border border-white/10" />
                  ))}
                </div>
              </div>

              {/* Drag hint */}
              {!isDragging && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/60 rounded text-[10px] text-white/60 pointer-events-none whitespace-nowrap">
                  Arraste para reposicionar &bull; Scroll para zoom
                </div>
              )}
            </div>
          </div>

          {/* Hidden canvas for export */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Zoom Controls */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-lg hover:bg-white/5 text-[#A1A1AA] hover:text-white transition-colors disabled:opacity-30"
              disabled={zoom <= 0.2 || isProcessing}
              title="Reduzir zoom"
            >
              <ZoomOut size={18} />
            </button>

            <input
              type="range"
              min={20}
              max={500}
              value={Math.round(zoom * 100)}
              onChange={(e) => {
                const newZoom = parseInt(e.target.value) / 100;
                setZoom(newZoom);
                setPosition(clampPosition(position, newZoom));
              }}
              className="flex-1 max-w-[200px] h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-500
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 
                [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-primary/30
                [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
              disabled={isProcessing}
            />

            <button
              onClick={handleZoomIn}
              className="p-2 rounded-lg hover:bg-white/5 text-[#A1A1AA] hover:text-white transition-colors disabled:opacity-30"
              disabled={zoom >= 5 || isProcessing}
              title="Aumentar zoom"
            >
              <ZoomIn size={18} />
            </button>

            <span className="text-xs text-[#6B7280] font-mono w-12 text-right">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/5">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[#A1A1AA] text-sm font-medium transition-colors border border-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white text-sm font-medium transition-all disabled:opacity-50 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Check size={16} />
                Aplicar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
