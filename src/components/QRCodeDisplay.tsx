import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  darkColor?: string;
  lightColor?: string;
  className?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  value,
  size = 100,
  darkColor = '#000000',
  lightColor = '#ffffff',
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    })
      .then(url => {
        if (isMounted) setDataUrl(url);
      })
      .catch(err => {
        console.error('Failed to generate QR code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [value, size, darkColor, lightColor]);

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-white/20 rounded ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-white/70">QR Code</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR Code de Verificação"
      width={size}
      height={size}
      className={`rounded shadow-xs ${className}`}
    />
  );
};
