import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArchitectFlow",
  description: "Design software architecture visually, validate it, and generate implementation prompts from the saved design.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
