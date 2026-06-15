import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '@/stores/auth.store';

function renderGuarded(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Nội dung bảo vệ</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Trang đăng nhập</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    renderGuarded();
    expect(screen.getByText('Nội dung bảo vệ')).toBeInTheDocument();
  });

  it('shows a spinner while auth is loading', () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: true });
    const { container } = renderGuarded();
    expect(screen.queryByText('Nội dung bảo vệ')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated', () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    renderGuarded();
    expect(screen.queryByText('Nội dung bảo vệ')).not.toBeInTheDocument();
    expect(screen.getByText('Trang đăng nhập')).toBeInTheDocument();
  });
});
