import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { AmbientCanvas } from "@/components/ambient-canvas";
import { AmbientBorder } from "@/components/ambient-border";
import { DeferredLayoutShells } from "@/components/deferred-layout-shells";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chat — Self-Modifier",
  description: "A self-modifying AI application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var light=t==='light';if(!light)document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen`}
      >
        <AmbientCanvas />
        <Navbar />
        <main className="flex-1 overflow-hidden relative z-[1]">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
        <DeferredLayoutShells />
        <AmbientBorder />
      </body>
    </html>
  );
}
