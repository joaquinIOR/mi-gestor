import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, FileSpreadsheet } from 'lucide-react';
import { categoryEmoji } from '../lib/categories';
import { formatMoney } from '../lib/format';
import { categoryComparison, downloadCsv, lastMonths, movementsCsv } from '../lib/summary';

const W = 320;
const H = 150;
const TOP = 22;
const BOTTOM = 22;
const BAR = 13;

// Barra con las esquinas superiores redondeadas (4 px) apoyada en la línea base.
function barPath(x, y, w, h) {
  const r = Math.min(4, h, w / 2);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const short = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

export default function MonthlySummary({ movements, groups, cursor, currency }) {
  const months = useMemo(() => lastMonths(movements, groups, cursor.y, cursor.m), [movements, groups, cursor]);
  const compare = useMemo(() => categoryComparison(movements, groups, cursor.y, cursor.m), [movements, groups, cursor]);
  const [selected, setSelected] = useState(months.length - 1);
  const [open, setOpen] = useState(false);
  const sel = months[Math.min(selected, months.length - 1)];
  const max = Math.max(1, ...months.flatMap((mo) => [mo.income, mo.expense]));
  const plotH = H - TOP - BOTTOM;
  const slot = W / months.length;
  const y = (v) => TOP + plotH - (v / max) * plotH;
  const hasData = months.some((mo) => mo.income || mo.expense);

  return (
    <section className="card summary">
      <div className="day-head">
        <h3 className="card-title">Últimos 6 meses</h3>
        <div className="legend-inline" aria-hidden="true">
          <span>
            <i className="dot-lg" style={{ background: 'var(--chart-income)' }} /> Ingresos
          </span>
          <span>
            <i className="dot-lg" style={{ background: 'var(--chart-expense)' }} /> Gastos
          </span>
        </div>
      </div>

      {hasData ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Ingresos y gastos de los últimos 6 meses. ${sel.name}: ingresos ${formatMoney(sel.income, currency)}, gastos ${formatMoney(sel.expense, currency)}.`}>
            {[0.5, 1].map((t) => (
              <line key={t} x1={0} x2={W} y1={y(max * t)} y2={y(max * t)} className="grid" />
            ))}
            <line x1={0} x2={W} y1={TOP + plotH} y2={TOP + plotH} className="axis" />
            {months.map((mo, i) => {
              const cx = slot * i + slot / 2;
              const xi = cx - BAR - 1;
              const xe = cx + 1;
              const active = i === selected;
              return (
                <g key={`${mo.y}-${mo.m}`} className={active ? 'active' : ''} onClick={() => setSelected(i)}>
                  <rect x={slot * i} y={0} width={slot} height={H} className="hit" />
                  <path d={barPath(xi, y(mo.income), BAR, TOP + plotH - y(mo.income))} fill="var(--chart-income)" />
                  <path d={barPath(xe, y(mo.expense), BAR, TOP + plotH - y(mo.expense))} fill="var(--chart-expense)" />
                  {active && mo.income > 0 && (
                    <text x={xi + BAR / 2} y={y(mo.income) - 5} className="value" textAnchor="middle">
                      {short(mo.income)}
                    </text>
                  )}
                  {active && mo.expense > 0 && (
                    <text x={xe + BAR / 2} y={y(mo.expense) - 5} className="value" textAnchor="middle">
                      {short(mo.expense)}
                    </text>
                  )}
                  <text x={cx} y={H - 6} className={`month ${active ? 'on' : ''}`} textAnchor="middle">
                    {mo.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="summary-detail">
            <b>{sel.name}:</b> ingresos {formatMoney(sel.income, currency)} · gastos {formatMoney(sel.expense, currency)} · balance{' '}
            <b className={sel.balance < 0 ? 'expense' : 'income'}>{formatMoney(sel.balance, currency)}</b>
          </p>
          <details className="summary-table">
            <summary>Ver los números</summary>
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Ingresos</th>
                  <th>Gastos</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {months.map((mo) => (
                  <tr key={`${mo.y}-${mo.m}`}>
                    <td>{mo.name}</td>
                    <td>{formatMoney(mo.income, currency)}</td>
                    <td>{formatMoney(mo.expense, currency)}</td>
                    <td>{formatMoney(mo.balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="empty">Cuando registres movimientos verás aquí cómo cambian mes a mes.</p>
      )}

      {compare.length > 0 && (
        <>
          <button type="button" className="btn ghost small summary-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown size={16} className={open ? 'rot' : ''} /> Gastos por tipo vs. mes anterior
          </button>
          {open && (
            <ul className="compare">
              {compare.map((c) => {
                const diff = c.before ? ((c.now - c.before) / c.before) * 100 : null;
                return (
                  <li key={c.name}>
                    <span>
                      {categoryEmoji(c.name)} {c.name}
                    </span>
                    <b>{formatMoney(c.now, currency)}</b>
                    <span className={`delta ${diff == null || Math.round(diff) === 0 ? '' : diff > 0 ? 'expense' : 'income'}`}>
                      {diff == null ? 'nuevo' : Math.round(diff) === 0 ? '=' : (
                        <>
                          {diff > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {Math.abs(Math.round(diff))} %
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <button
        type="button"
        className="btn small"
        onClick={() =>
          window.confirm('Se descargará un archivo para Excel con tus movimientos de los últimos 24 meses. Ese archivo NO está cifrado: guárdalo con cuidado. ¿Continuar?') &&
          downloadCsv(movementsCsv(movements, groups))
        }
      >
        <FileSpreadsheet size={16} /> Exportar a Excel
      </button>
    </section>
  );
}
