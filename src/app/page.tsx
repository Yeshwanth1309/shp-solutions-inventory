import { redirect } from 'next/navigation';
import { getSession } from '@/server/http/auth-guard';

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? '/dashboard' : '/login');
}
