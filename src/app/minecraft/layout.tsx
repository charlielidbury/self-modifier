import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Minecraft — Self-Modifier",
};

export default function MinecraftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
