import './globals.css';
import { GeistSans } from 'geist/font/sans';
import { IBM_Plex_Mono } from 'next/font/google';

const ibmMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'The Bureau • Prototype Business Reality.',
  description:
    'An executive visual operating layer for modern studios. People, projects, money, time • Connected.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
  <html lang="en" className={`${GeistSans.className} ${ibmMono.variable}`}>
    <body>{children}</body>
  </html>
);
}