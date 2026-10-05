'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AdminContextProvider } from './admin-context';
import Sidebar from './Sidebar';
import Header from './Header';
import PageHeader from './PageHeader';

const titleMap: Record<string, { title: string; description: string }> = {
  '/admin': { title: 'Overview', description: 'Monitor the health and performance of your Sedifex platform.' },
  '/admin/stores': { title: 'Client Workspaces', description: 'Manage active Sedifex client workspaces, profiles, plans, and website operations.' },
  '/admin/store-activity': { title: 'Client Activity', description: 'Track client workspace activity, bookings, orders, and revenue signals.' },
  '/admin/customers': { title: 'Customers', description: 'See customer records across stores, with contact details, store links, and order history.' },
  '/admin/products': { title: 'Catalog Review', description: 'Review products, services, and courses used by client Sedifex websites.' },
  '/admin/poster-generator': { title: 'Poster Generator', description: 'Create branded Sedifex Market product posters with QR codes in one click.' },
  '/admin/google-sync': { title: 'Google Sync', description: 'Approve, block, and review products before they reach Google Merchant Center.' },
  '/admin/catalog-repair': { title: 'Catalog Repair', description: 'Rebuild public marketplace listings for each store.' },
  '/admin/client-items': { title: 'Add Client Item', description: 'Create a product, service, or course for an authorized client workspace without using client credentials.' },
  '/admin/bookings': { title: 'Bookings', description: 'Review website bookings and payment-confirmation state across client workspaces.' },
  '/admin/orders': { title: 'Orders', description: 'Monitor client orders, payments, buyers, and source channels.' },
  '/admin/settlements': { title: 'Settlements', description: 'Track manual store payouts when Paystack split settlement is pending or unavailable.' },
  '/admin/checkout-health': { title: 'Checkout Health', description: 'Diagnose store setup, payment, environment, and webhook issues.' },
  '/admin/deliveries': { title: 'Webhook Deliveries', description: 'Inspect real webhook deliveries, failures, retries, and replay actions.' },
  '/admin/live-chat': { title: 'Live Chat', description: 'Reply to Sedifex Market visitor messages and manage support conversations.' },
  '/admin/marketing': { title: 'Marketing Center', description: 'Filter contacts and send bulk campaigns.' },
  '/admin/adverts': { title: 'Advert Manager', description: 'Create, schedule, and manage Sedifex Market homepage flash adverts.' },
  '/admin/store-access': { title: 'Store Access', description: 'Reset store Firebase Auth email and password while keeping UID metadata in sync.' },
  '/admin/store-settings/manage': { title: 'Advanced Store Settings', description: 'Edit technical store settings, integration API, auto-sync, and booking sync safely.' },
};

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminContextProvider>
      <ShellFrame>{children}</ShellFrame>
    </AdminContextProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageMeta = useMemo(() => {
    if (pathname?.startsWith('/admin/stores/') && pathname.endsWith('/edit')) {
      return { title: 'Edit Store', description: 'Update public store profile, marketplace status, and common store fields.' };
    }
    if (pathname?.startsWith('/admin/stores/')) {
      return { title: 'Store Details', description: 'Review rich store profile, catalog, billing, and integration status.' };
    }
    if (pathname?.startsWith('/admin/customers/')) {
      return { title: 'Customer Details', description: 'Review a customer profile, contact details, linked store, and order history.' };
    }
    return titleMap[pathname] ?? { title: 'Admin', description: 'Sedifex administration portal.' };
  }, [pathname]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex">
        <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="min-w-0 flex-1 lg:pl-72">
          <Header onOpenMobile={() => setMobileOpen(true)} mobileTrigger={<Menu className="h-5 w-5" />} />
          <main className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
              <PageHeader title={pageMeta.title} description={pageMeta.description} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
