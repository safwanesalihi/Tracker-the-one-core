import type { Metadata } from "next";
import "./globals.css";
import "./modern.css";
import "./team.css";
import "./login.css";
import "./date-picker.css";
import "./flow.css";
import "./print.css";
import { LocaleProvider } from "./locale-provider";
export const metadata: Metadata = { title: "The One Tracker — The One Core", description: "Votre espace de production et de validation client.", icons: {icon: "/favicon.svg"} };
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="fr" suppressHydrationWarning><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&amp;family=Inter:wght@400;500;600&amp;display=swap" rel="stylesheet"/></head><body><LocaleProvider>{children}</LocaleProvider></body></html>; }
