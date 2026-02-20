
import React from 'react';
import logoUrl from '../assets/logo.png';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <img
      src={logoUrl}
      alt="DijitalPark Teknokent Logo"
      className={`h-12 w-auto object-contain ${className}`}
    />
  );
};
