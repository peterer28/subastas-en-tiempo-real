import { Pipe, PipeTransform } from '@angular/core';

const qFormat = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 });

export function formatQ(value: number | null | undefined): string {
  return `Q ${qFormat.format(Math.round(value ?? 0))}`;
}

/** Tiempo restante legible: "2 d 4 h", "3 h 12 min", "12:04". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const dateFmt = new Intl.DateTimeFormat('es-GT', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export function formatDate(value: string | number): string {
  return dateFmt.format(new Date(value));
}

@Pipe({ name: 'q', standalone: true })
export class QuetzalPipe implements PipeTransform {
  transform(value: number | null | undefined): string { return formatQ(value); }
}

@Pipe({ name: 'remaining', standalone: true })
export class RemainingPipe implements PipeTransform {
  transform(ms: number): string { return formatRemaining(ms); }
}

@Pipe({ name: 'when', standalone: true })
export class WhenPipe implements PipeTransform {
  transform(value: string | number): string { return formatDate(value); }
}
