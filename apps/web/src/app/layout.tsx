import type { Metadata, Viewport } from "next";
import "@pingo/ui/styles.css";
export const metadata: Metadata = {
  title: "Pingo — seu pequeno assistente",
  description:
    "Seu dia, suas tarefas e um pequeno amigo para cuidar da rotina.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Pingo", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#bddbd3",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
