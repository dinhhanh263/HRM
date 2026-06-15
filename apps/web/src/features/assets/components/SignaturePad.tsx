import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  // Báo lên cha mỗi khi nét vẽ thay đổi: PNG data URL nếu có nét, null nếu trống.
  onChange: (dataUrl: string | null) => void;
  className?: string;
  disabled?: boolean;
}

// Canvas vẽ tay không phụ thuộc thư viện ngoài. Dùng Pointer Events nên hỗ trợ
// cả chuột, cảm ứng và bút. Vẽ ở độ phân giải devicePixelRatio cho nét sắc.
export function SignaturePad({ onChange, className, disabled }: SignaturePadProps) {
  const { t } = useTranslation('asset');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Khởi tạo kích thước canvas theo container + DPR; nền trắng để PNG không trong suốt.
  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!dirty.current) {
      dirty.current = true;
      setHasInk(true);
    }
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) {
      onChange(canvasRef.current?.toDataURL('image/png') ?? null);
    }
  }

  function clear() {
    setup();
    dirty.current = false;
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative rounded-lg border border-border bg-white">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t('asset.handover.signaturePadLabel')}
          className={cn(
            'h-40 w-full touch-none rounded-lg',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair',
          )}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {t('asset.handover.signatureHint')}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={clear}
        disabled={disabled || !hasInk}
        className="h-9 gap-1.5"
      >
        <Eraser size={14} />
        {t('asset.handover.signatureClear')}
      </Button>
    </div>
  );
}
