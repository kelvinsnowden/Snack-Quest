import React from 'react';
import { Hourglass } from 'lucide-react';
import { EmptyState } from '../../common/EmptyState';

interface ComingSoonViewProps {
  title: string;
  description: string;
}

export const ComingSoonView: React.FC<ComingSoonViewProps> = ({ title, description }) => (
  <EmptyState icon={Hourglass} title={title} description={description} />
);
