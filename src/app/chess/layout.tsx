import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chess — Self-Modifier",
};

export default function ChessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
