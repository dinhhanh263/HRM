import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { Toaster } from './components/ui/toast';
import { ThemeInitializer } from './app/ThemeInitializer';
import { AuthInitializer } from './app/AuthInitializer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeInitializer />
      <AuthInitializer>
        <RouterProvider router={router} />
      </AuthInitializer>
      <Toaster />
    </QueryClientProvider>
  );
}
