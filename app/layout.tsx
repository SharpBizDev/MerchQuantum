export const metadata = {
  title: "MerchQuantum",
  description: "Bulk product creation, simplified",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
