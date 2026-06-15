import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { SignaturePad } from './SignaturePad';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSU=';

// jsdom has no 2D canvas backend; stub the surface SignaturePad touches so the
// drawing flow runs and toDataURL yields a deterministic PNG to assert against.
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
  // Pointer capture isn't implemented in jsdom.
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

function drawStroke(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SignaturePad', () => {
  it('emits a PNG data URL after a stroke and hides the hint', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    // Hint visible and clear button disabled before any ink.
    expect(screen.getByText('Ký tên vào đây')).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: /Vẽ lại/i });
    expect(clearBtn).toBeDisabled();

    drawStroke(screen.getByRole('img', { name: /Khu vực ký tên/i }));

    expect(onChange).toHaveBeenCalledWith(PNG_DATA_URL);
    expect(screen.queryByText('Ký tên vào đây')).not.toBeInTheDocument();
    expect(clearBtn).toBeEnabled();
  });

  it('clears back to an empty pad and reports null', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    drawStroke(screen.getByRole('img', { name: /Khu vực ký tên/i }));
    onChange.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /Vẽ lại/i }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByText('Ký tên vào đây')).toBeInTheDocument();
  });

  it('does not draw when disabled', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} disabled />);

    drawStroke(screen.getByRole('img', { name: /Khu vực ký tên/i }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
