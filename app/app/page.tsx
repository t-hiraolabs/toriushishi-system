import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the static index.html served from public/
  redirect('/index.html');
}
