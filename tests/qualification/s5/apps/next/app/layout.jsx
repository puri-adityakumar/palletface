export const metadata = {
  title: 'S5 Next qualification',
  description: 'dither-face SSR and hydration fixture',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
