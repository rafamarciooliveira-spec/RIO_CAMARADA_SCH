import React from 'react';
import {
  Shield,
  Award,
  Flame,
  Globe,
  Landmark,
  Users,
  HeartHandshake,
  Scale,
  Crown,
  Trees,
  Building2,
  Sparkles,
} from 'lucide-react';

interface LogoProps {
  logoKeyOrUrl: string;
  className?: string;
  color?: string;
}

export const PRESET_LOGOS = [
  { id: 'shield', label: 'Brasão Imperial', icon: Shield },
  { id: 'heart', label: 'Ação Social & Apoio', icon: HeartHandshake },
  { id: 'landmark', label: 'Institucional Cívico', icon: Landmark },
  { id: 'scale', label: 'Direito & Justiça', icon: Scale },
  { id: 'award', label: 'Medalha de Honra', icon: Award },
  { id: 'crown', label: 'Coroa & Nobreza', icon: Crown },
  { id: 'flame', label: 'Chama Olímpica / Social', icon: Flame },
  { id: 'globe', label: 'Rede Global / Unidade', icon: Globe },
  { id: 'users', label: 'União Comunitária', icon: Users },
  { id: 'trees', label: 'Ecológica & Sustentável', icon: Trees },
  { id: 'building', label: 'Grêmio / Sede Social', icon: Building2 },
  { id: 'sparkles', label: 'Estrela / Excelência', icon: Sparkles },
];

export const AssociationLogo: React.FC<LogoProps> = ({
  logoKeyOrUrl,
  className = 'w-8 h-8',
  color = 'currentColor',
}) => {
  // If it's a URL or base64 image
  if (
    logoKeyOrUrl &&
    (logoKeyOrUrl.startsWith('http://') ||
      logoKeyOrUrl.startsWith('https://') ||
      logoKeyOrUrl.startsWith('data:image'))
  ) {
    return (
      <img
        src={logoKeyOrUrl}
        alt="Logo da Associação"
        className={`object-contain ${className}`}
      />
    );
  }

  // Preset vector symbols
  const found = PRESET_LOGOS.find(p => p.id === logoKeyOrUrl);
  const IconComponent = found ? found.icon : Shield;

  return <IconComponent className={className} style={{ color }} />;
};
