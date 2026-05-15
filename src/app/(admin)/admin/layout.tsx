import AdminShell from '@/components/admin/AdminShell';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminRouteChrome } from './AdminRouteChrome';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminRouteChrome />
      <AdminShell>{children}</AdminShell>
    </SidebarProvider>
  );
}
