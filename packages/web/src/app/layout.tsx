import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentWatch — Your agents, at work",
  description:
    "Локальний офіс ваших AI-агентів. Живі сесії Claude Code та Codex.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
