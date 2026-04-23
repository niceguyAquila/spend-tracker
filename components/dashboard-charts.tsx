"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type MonthlySummaryRow = {
  month_key: string;
  total_amount: number;
};

type CategorySplitRow = {
  category_name: string;
  total_amount: number;
};

export function DashboardCharts({
  monthlySummary,
  categorySplit
}: {
  monthlySummary: MonthlySummaryRow[];
  categorySplit: CategorySplitRow[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="card h-80">
        <h2 className="mb-4 text-lg font-semibold">Monthly Spend Trend</h2>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={monthlySummary}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month_key" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="total_amount" stroke="#0f172a" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="card h-80">
        <h2 className="mb-4 text-lg font-semibold">Category Split</h2>
        <ResponsiveContainer width="100%" height="85%">
          <PieChart>
            <Pie data={categorySplit} dataKey="total_amount" nameKey="category_name" outerRadius={100} />
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </section>

      <section className="card h-80 xl:col-span-2">
        <h2 className="mb-4 text-lg font-semibold">Category Comparison</h2>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={categorySplit}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category_name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="total_amount" fill="#334155" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
