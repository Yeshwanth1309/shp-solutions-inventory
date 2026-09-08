import { Printer } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Printer className="h-6 w-6 text-primary" aria-hidden />
          <span className="text-base font-semibold">SHP Solutions</span>
        </div>
        {children}
      </div>
    </div>
  );
}
