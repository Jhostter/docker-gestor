import "./globals.css";
export const metadata = { title: "Docker Gestor", description: "Panel local para gestionar Docker" };

// Apply the saved theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
