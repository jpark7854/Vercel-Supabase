import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/projects', label: '프로젝트' },
  { href: '/admin/inspection', label: '입고 검수' },
  { href: '/admin/ledger', label: '발송·승인 대장' },
  { href: '/admin/audit', label: '활동 기록' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link href="/admin" className="shrink-0 font-bold">디자인 포털</Link>
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-slate-700 hover:bg-slate-100">{n.label}</Link>
            ))}
            {staff.role === 'admin' && <Link href="/admin/settings" className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-slate-700 hover:bg-slate-100">설정</Link>}
          </nav>
          <Link href="/admin/account" className="hidden text-sm text-slate-600 sm:block">{staff.name}</Link>
          <form action={signOut}>
            <button className="btn btn-sm">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
