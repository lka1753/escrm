import './globals.css';

export const metadata = { title: 'Easy Shift CRM', description: 'Easy Shift multi-company lead management CRM' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}