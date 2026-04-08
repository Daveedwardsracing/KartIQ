import "./globals.css";

export const metadata = {
  title: "DER Telemetry Analysis Software",
  description: "DER Telemetry Analysis Software",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
