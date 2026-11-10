import "./globals.css";
export const metadata = { title: "Docker Gestor" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es"><body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body></html>
  );
}
