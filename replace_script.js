const fs = require('fs');
let content = fs.readFileSync('pages/Dashboard.tsx', 'utf8');
const replacement = `// --- Modern Premium Active Shape ---
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;

  // Word wrapping logic
  const words = payload.name.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    if (currentLine.length + 1 + words[i].length <= 20) { // Max 20 chars per line
      currentLine += ' ' + words[i];
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  // Limit to 3 lines max to prevent overflow
  const displayLines = lines.slice(0, 3);

  return (
    <g>
      {/* Outer glow ring */}
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 12}
        fill={fill}
        opacity={0.15}
        cornerRadius={12}
      />
      {/* Main expanded sector */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 2}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={6}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
      />

      {/* Name - Moved to right side with connecting line/dot */}
      <g>
        {/* Dynamic height bar based on line count */}
        <rect
          x={cx + outerRadius + 15}
          y={cy - (displayLines.length * 8)}
          width="4"
          height={displayLines.length * 16}
          rx="2"
          fill={fill}
          opacity={0.8}
        />
        <text x={cx + outerRadius + 26} y={cy} dy={displayLines.length === 1 ? 5 : -(displayLines.length * 6) + 6} textAnchor="start" fill="#1e293b" style={{ fontSize: '13px', fontFamily: 'Inter, system-ui', fontWeight: '600' }}>
          {displayLines.map((line, i) => (
            <tspan x={cx + outerRadius + 26} dy={i === 0 ? 0 : 16} key={i}>{line}</tspan>
          ))}
        </text>
      </g>

      {/* Center Info - Only Percent and Count */}
      <text x={cx} y={cy} dy={-2} textAnchor="middle" dominantBaseline="central" fill={fill} style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'Inter, system-ui' }}>
        {\`%\${(percent * 100).toFixed(1)}\`}
      </text>
      <text x={cx} y={cy} dy={20} textAnchor="middle" dominantBaseline="central" fill="#94a3b8" style={{ fontSize: '11px', fontFamily: 'Inter, system-ui', fontWeight: '600' }}>
        {value} Firma
      </text>
    </g>
  );
};

// --- Modern Center Label ---
const CustomCenterLabel = ({ viewBox, hasActiveIndex, totalCompanies, totalSectors }: any) => {
  const { cx, cy } = viewBox || {};
  if (hasActiveIndex || !cx || !cy) return null;

  return (
    <g>
      <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'Inter, system-ui', letterSpacing: '-0.025em' }}>
        {totalCompanies}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" style={{ fontSize: '10px', fontWeight: '700', fontFamily: 'Inter, system-ui', letterSpacing: '0.08em', textTransform: 'uppercase' } as any}>
        TOPLAM FİRMA
      </text>
    </g>
  );
};`;
const startIndex = content.indexOf('// --- Ultra Smooth Premium Active Shape ---');
if (startIndex !== -1) {
    const endMarker = 'import { ContractCalendar } from \'../components/ContractCalendar\';';
    const endIndex = content.indexOf(endMarker, startIndex);
    if (endIndex !== -1) {
        content = content.substring(0, startIndex) + replacement + '\n\n' + content.substring(endIndex);
        fs.writeFileSync('pages/Dashboard.tsx', content);
        console.log('Replaced successfully.');
    } else {
        console.log('End marker not found.');
    }
} else {
    console.log('Start marker not found.');
}
