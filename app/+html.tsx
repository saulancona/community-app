import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* Apple touch icon for iOS home screen */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Web app manifest for PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
