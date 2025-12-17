import React from 'react';

// SVG paths cho các loại mũi tên
const ARROW_PATHS = {
  straight: "M12 2L4.5 10H9V22H15V10H19.5L12 2Z",
  turnLeft: "M20 14C20 10.134 16.866 7 13 7H9V3L2 10L9 17V13H13C13.5523 13 14 13.4477 14 14V22H20V14Z",
  turnRight: "M4 14C4 10.134 7.134 7 11 7H15V3L22 10L15 17V13H11C10.4477 13 10 13.4477 10 14V22H4V14Z",
  shiftLeft: "M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z",
  shiftRight: "M8.59 16.59L10 18L16 12L10 6L8.59 7.41L13.17 12L8.59 16.59Z"
};

const TurnArrow = ({ 
  type = 'straight',
  color = '#FFCC00',
  heading = 0,
  tilt = 65,
  size = 'normal'
}) => {
  // Size mapping for arrows - 3X BIGGER
  const sizeMap = {
    small: { width: 300, svgSize: 240, strokeWidth: 1 },
    normal: { width: 420, svgSize: 360, strokeWidth: 1.5 },
    large: { width: 540, svgSize: 480, strokeWidth: 2.5 }
  };

  const dimensions = sizeMap[size] || sizeMap.normal;
  
  const isTurn = type === 'turnLeft' || type === 'turnRight';
  const isStraight = type === 'straight';
  const isShift = type === 'shiftLeft' || type === 'shiftRight';

  // Container style - simple and direct
  const containerStyle = {
    width: `${dimensions.width}px`,
    height: `${dimensions.width}px`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none'
  };

  // Only turn/straight arrows get slight tilt for 3D effect
  const effectiveTilt = (isTurn || isStraight) ? 50 : 0;
  
  const arrowStyle = {
    transform: `rotateX(${effectiveTilt}deg)`,
    transition: 'transform 0.3s ease-out',
    filter: isShift ? 'none' : 'drop-shadow(0px 8px 12px rgba(0,0,0,0.4))'
  };

  return (
    <div style={containerStyle}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1; }
        }
      `}</style>
      <div style={arrowStyle}>
        <svg 
          width={dimensions.svgSize} 
          height={dimensions.svgSize} 
          viewBox="0 0 24 24" 
          fill="none"
        >
          <defs>
            {/* Gradient cho hiệu ứng 3D - darker for more contrast */}
            <linearGradient id={`grad-${type}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{stopColor: adjustColor(color, 30), stopOpacity: 1}} />
              <stop offset="100%" style={{stopColor: adjustColor(color, -60), stopOpacity: 1}} />
            </linearGradient>
            {/* Shadow/highlight cho depth */}
            <filter id="innerShadow">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
              <feOffset dx="0" dy="2" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.5"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path 
            d={ARROW_PATHS[type]} 
            fill={`url(#grad-${type})`}
            stroke={isShift ? adjustColor(color, -30) : "rgba(255,255,255,0.4)"}
            strokeWidth={isShift ? "0.4" : "0.3"}
            filter={isShift ? "none" : "url(#innerShadow)"}
          />
        </svg>
      </div>
    </div>
  );
};

// Helper function để làm tối màu cho gradient
function adjustColor(color, amount) {
  const usePound = color[0] === '#';
  const col = usePound ? color.slice(1) : color;
  
  const num = parseInt(col, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
  
  return (usePound ? '#' : '') + (
    (r << 16) | (g << 8) | b
  ).toString(16).padStart(6, '0');
}

export default TurnArrow;
