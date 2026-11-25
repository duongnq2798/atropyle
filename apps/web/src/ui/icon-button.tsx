'use client';

import { PlainIconButton, type PlainIconButtonProps } from './plain-icon-button';
import { Tooltip } from './tooltip';

export interface IconButtonProps extends PlainIconButtonProps {
  /** Shows the label as a tooltip too. Without one, use PlainIconButton: this file brings the Radix tooltip. */
  tooltip?: boolean;
}

export function IconButton({ tooltip = true, ...rest }: IconButtonProps) {
  const button = <PlainIconButton {...rest} />;
  return tooltip ? <Tooltip content={rest.label}>{button}</Tooltip> : button;
}
