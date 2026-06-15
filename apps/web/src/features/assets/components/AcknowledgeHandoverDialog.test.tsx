import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { AcknowledgeHandoverDialog } from './AcknowledgeHandoverDialog';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSU=';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => PNG_DATA_URL);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

function drawStroke(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

const onSubmit = vi.fn();
const onOpenChange = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AcknowledgeHandoverDialog', () => {
  it('keeps submit disabled until a signature is drawn, then submits the PNG', () => {
    render(<AcknowledgeHandoverDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /Xác nhận đã nhận/i });
    expect(submitBtn).toBeDisabled();

    drawStroke(screen.getByRole('img', { name: /Khu vực ký tên/i }));
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledWith(PNG_DATA_URL);
  });

  it('does not submit when no signature has been drawn', () => {
    render(<AcknowledgeHandoverDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã nhận/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
