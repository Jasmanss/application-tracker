import { STATUS_LABEL, type Status } from '../types';

interface Props {
  status: Status;
  size?: 'sm' | 'md' | 'lg';
  /** Plays the "thunk" when the stamp first appears. */
  animate?: boolean;
}

/** Status shown as a rubber stamp, the way it'd be marked on a paper application. */
export function Stamp({ status, size = 'md', animate = false }: Props) {
  return (
    <span className={`stamp stamp-${size}${animate ? ' stamp-animate' : ''}`} data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}
