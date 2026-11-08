// Gráficos del dashboard (Recharts). Marcas finas, eje único, cuadrícula discreta, tooltip al pasar el cursor.
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axisTick = { fill: "var(--ink-3)", fontSize: 11 };

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { name: string; value: number; color: string; payload: Record<string, unknown> }[];
}

function ChartTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-semibold text-[var(--ink)]">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[var(--ink-2)]">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="tabular font-semibold text-[var(--ink)]">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function ActivityChart({ data }: { data: { label: string; analyses: number; alerts: number }[] }) {
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-[var(--ink-2)]" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--series-1)]" />Análisis</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--series-2)]" />Alertas generadas</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval="preserveStartEnd" minTickGap={12} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="analyses" name="Análisis" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="alerts" name="Alertas generadas" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ClassDistributionChart({ data }: { data: { name: string; count: number; color: string }[] }) {
  return (
    <div style={{ height: Math.max(160, data.length * 30 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={{ ...axisTick, fill: "var(--ink-2)" }} tickLine={false} axisLine={{ stroke: "var(--axis)" }} width={92} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="count" name="Objetos" radius={[0, 4, 4, 0]} maxBarSize={16} label={{ position: "right", fill: "var(--ink-2)", fontSize: 11 }}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
