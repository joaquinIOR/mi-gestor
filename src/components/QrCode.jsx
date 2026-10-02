import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// Código QR dibujado como SVG (sin imágenes externas ni scripts en línea).
export default function QrCode({ text, size = 220 }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    }
    return { count: n, path: d };
  }, [text]);

  return (
    <svg
      className="qr"
      viewBox={`-3 -3 ${count + 6} ${count + 6}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Código QR de la invitación"
    >
      <rect x={-3} y={-3} width={count + 6} height={count + 6} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
