
import React from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  BarChart3,
  Newspaper,
  LineChart,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";

const Footer = () => {
  return (
    <footer className="mt-12 border-t border-white/10 bg-[#0b0f14]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>

              <span className="text-lg font-semibold text-white">
                Nhóm Sinh Viên KLCN-284
              </span>
            </div>

            <p className="max-w-sm text-sm leading-6 text-gray-400">
              Lương Kiến Toàn 
            </p>
            <p className="max-w-sm text-sm leading-6 text-gray-400">              
              Chung Nhã Quỳnh
            </p>
            <p className="max-w-sm text-sm leading-6 text-gray-400">
              Trần Nguyên Hậu
            </p>
          </div>

          {/* Platform */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              Platform
            </h3>

            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  to="/"
                  className="flex items-center gap-2 text-gray-400 transition hover:text-white"
                >
                  <BarChart3 className="h-4 w-4" />
                  Dashboard
                </Link>
              </li>

              <li>
                {/* Used to point at /technical, which is not a route - it ended on the 404 page. */}
                <Link
                  to="/analysis/VIC"
                  className="flex items-center gap-2 text-gray-400 transition hover:text-white"
                >
                  <LineChart className="h-4 w-4" />
                  Technical Analysis
                </Link>
              </li>

              <li>
                <Link
                  to="/news"
                  className="flex items-center gap-2 text-gray-400 transition hover:text-white"
                >
                  <Newspaper className="h-4 w-4" />
                  Market News
                </Link>
              </li>

              <li>
                <Link
                  to="/trading"
                  className="flex items-center gap-2 text-gray-400 transition hover:text-white"
                >
                  <TrendingUp className="h-4 w-4" />
                  Paper Trading
                </Link>
              </li>
            </ul>
          </div>

          {/* AI & Analysis */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              AI & Analysis
            </h3>

            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2 text-gray-400">
                <TrendingUp className="h-4 w-4" />
                LSTM Prediction
              </li>

              <li className="flex items-center gap-2 text-gray-400">
                <MessageCircle className="h-4 w-4" />
                Alpha AI
              </li>

              <li className="flex items-center gap-2 text-gray-400">
                <BarChart3 className="h-4 w-4" />
                Technical Indicators
              </li>

              <li className="flex items-center gap-2 text-gray-400">
                <ShieldCheck className="h-4 w-4" />
                Risk Analysis
              </li>
            </ul>
          </div>

          {/* Disclaimer */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
              Disclaimer
            </h3>

            <p className="text-sm leading-6 text-gray-400">

            </p>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm md:flex-row md:items-center md:justify-between">
          <p className="text-gray-500">
            © {new Date().getFullYear()} Alpha Markets. All rights reserved.
          </p>

          <p className="text-gray-500">
            LSTM · Agentic AI · Technical Analysis
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

