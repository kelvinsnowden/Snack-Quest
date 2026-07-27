import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { useApp } from '../../context/AppContext';

interface ChartWrapperProps {
  type: 'line' | 'bar' | 'donut';
  title?: string;
  data: any[];
  dataKey?: string;
  categoryKey?: string;
  height?: number;
  colors?: string[];
}

export const ChartWrapper: React.FC<ChartWrapperProps> = ({
  type,
  title,
  data,
  dataKey = 'value',
  categoryKey = 'name',
  height = 240,
  colors = ['#2563eb', '#10b981', '#a855f7', '#f97316', '#3b82f6']
}) => {
  const { theme } = useApp();

  const gridColor = '#27272A';
  const textColor = '#71717A';
  const tooltipBg = '#18181B';
  const tooltipBorder = '#27272A';

  return (
    <div className="w-full bg-[#18181B] border border-[#27272A] rounded-lg p-5 shadow-sm">
      {title && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-4">
          {title}
        </h4>
      )}

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey={categoryKey} stroke={textColor} fontSize={11} tickLine={false} />
              <YAxis stroke={textColor} fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  borderColor: tooltipBorder,
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '12px'
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={colors[0]}
                strokeWidth={2.5}
                dot={{ r: 4, fill: colors[0] }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          ) : type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey={categoryKey} stroke={textColor} fontSize={11} tickLine={false} />
              <YAxis stroke={textColor} fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  borderColor: tooltipBorder,
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey={dataKey} fill={colors[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={4}
                dataKey={dataKey}
                nameKey={categoryKey}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  borderColor: tooltipBorder,
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '12px'
                }}
              />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', color: textColor }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
