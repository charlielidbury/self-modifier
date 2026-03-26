import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fractals — Self-Modifier",
};

export default function FractalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
