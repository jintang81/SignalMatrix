import type { Metadata } from "next";
import { Share_Tech_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";

const shareTechMono = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-stm",
  display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-nsc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "SignalMatrix — 智能股票筛选与技术分析",
  description:
    "面向美股个人散户的智能股票筛选与技术分析平台。技术指标、Bull/Bear 信号筛选、AI 综合评分一体化。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${shareTechMono.variable} ${notoSerifSC.variable}`}
    >
      <body>
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
