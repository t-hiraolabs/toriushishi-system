export const metadata = {
  title: '鳥生獅子連 管理システム',
  description: '鳥生獅子連 メンバー管理システム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
