import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { ForbiddenPage } from './ForbiddenPage';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForbiddenPage', () => {
  it('renders the access-denied message', () => {
    render(<ForbiddenPage />);
    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('navigates back when the back button is clicked', async () => {
    render(<ForbiddenPage />);
    await userEvent.click(screen.getByRole('button', { name: /Quay lại/i }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('navigates home when the home button is clicked', async () => {
    render(<ForbiddenPage />);
    await userEvent.click(screen.getByRole('button', { name: /Về trang chủ/i }));
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
