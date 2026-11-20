import ClientView from './client-view';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ผู้จัดคิว | GACP Platform',
  description: 'ผู้จัดคิว มอบหมายงานและนัดตรวจคำขอ GACP',
};

/**
 * Server Component wrapper — exports route metadata at build-time
 * and renders the Client island below.
 */
export default function Page() {
  return (
    <main className="h-full min-h-screen w-full">
      <ClientView />
    </main>
  );
}
