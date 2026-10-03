import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, AuctionPhase, LiveAuction, LiveBid } from '../../core/models/models';
import { VehicleService } from '../../core/services/vehicle.service';
import { QuetzalPipe, RemainingPipe, WhenPipe } from '../../shared/format';

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

@Component({
  selector: 'app-bid-panel',
  standalone: true,
  imports: [FormsModule, QuetzalPipe, RemainingPipe, WhenPipe],
  templateUrl: './bid-panel.component.html',
  styleUrl: './bid-panel.component.css',
})
export class BidPanelComponent {
  private vehicles = inject(VehicleService);
  private router = inject(Router);

  auctionId = input.required<string>();
  auction = input.required<LiveAuction | null>();
  bids = input<LiveBid[]>([]);
  now = input.required<number>();
  myToken = input<string | null>(null);
  loggedIn = input(false);
  isOwner = input(false);

  readonly ringC = RING_C;
  readonly ringR = RING_R;

  tab = signal<'info' | 'bids'>('info');
  amount = signal(0);
  sending = signal(false);
  message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  pulse = signal(false);

  private history = viewChild<ElementRef<HTMLElement>>('history');
  private amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  // ---------- Estado derivado ----------
  remaining = computed(() => {
    const a = this.auction();
    return a ? Math.max(0, a.endsAt - this.now()) : 0;
  });

  phase = computed<AuctionPhase>(() => {
    const a = this.auction();
    if (!a) return 'closed';
    if (a.status === 'sold' || a.status === 'deserted' || this.remaining() <= 0) return 'closed';
    if (this.now() < a.startsAt) return 'scheduled';
    return this.remaining() <= a.softCloseMs ? 'final' : 'live';
  });

  /** Segundos del minuto final y fracción consumida para la rueda. */
  seconds = computed(() => Math.ceil(this.remaining() / 1000));
  ringOffset = computed(() => {
    const a = this.auction();
    const total = a?.softCloseMs || 60000;
    const fraction = Math.min(1, this.remaining() / total);
    return RING_C * (1 - fraction);
  });

  highBid = computed(() => this.auction()?.currentBid ?? 0);
  nextMin = computed(() => this.auction()?.nextMinBid ?? this.auction()?.basePrice ?? 0);
  bidCount = computed(() => this.auction()?.bidCount ?? 0);

  /** Paso de los botones − / + : 5 % del mínimo, redondeado a centenas. */
  step = computed(() => Math.max(100, Math.round((this.nextMin() * 0.05) / 100) * 100));

  participated = computed(() => {
    const token = this.myToken();
    return !!token && this.bids().some((b) => b.bidderToken === token);
  });

  standing = computed<'winning' | 'outbid' | null>(() => {
    const token = this.myToken();
    const a = this.auction();
    if (!token || !a || !a.leaderToken) return null;
    if (a.leaderToken === token) return 'winning';
    return this.participated() ? 'outbid' : null;
  });

  outcome = computed(() => {
    const a = this.auction();
    if (this.phase() !== 'closed' || !a) return null;
    if (a.status === 'sold' || (a.bidCount > 0 && a.currentBid >= a.basePrice)) {
      return { sold: true, price: a.result?.finalPrice || a.currentBid };
    }
    return { sold: false, price: 0 };
  });

  canBid = computed(() => this.loggedIn() && !this.isOwner() && (this.phase() === 'live' || this.phase() === 'final'));

  constructor() {
    // Mantener el monto propuesto siempre ≥ mínimo cuando llegan nuevas pujas
    effect(() => {
      const min = this.nextMin();
      untracked(() => { if (this.amount() < min) this.amount.set(min); });
    }, { allowSignalWrites: true });

    // Pulso visual cuando una puja reinicia el minuto final
    let lastExtensions = -1;
    effect(() => {
      const ext = this.auction()?.extensions ?? 0;
      if (lastExtensions >= 0 && ext > lastExtensions) {
        untracked(() => {
          this.pulse.set(true);
          setTimeout(() => this.pulse.set(false), 900);
        });
      }
      lastExtensions = ext;
    }, { allowSignalWrites: true });

    // Mantener el historial desplazado hasta la puja más reciente
    effect(() => {
      this.bids();
      if (this.tab() !== 'bids') return;
      queueMicrotask(() => {
        const el = this.history()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  // ---------- Acciones ----------
  openBidding(): void {
    if (!this.loggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.tab.set('bids');
    setTimeout(() => this.amountInput()?.nativeElement.focus(), 50);
  }

  dec(): void { this.amount.set(Math.max(this.nextMin(), this.amount() - this.step())); }
  inc(): void { this.amount.set(this.amount() + this.step()); }

  onAmountInput(value: string): void {
    const n = parseInt(value.replace(/\D/g, ''), 10);
    this.amount.set(Number.isFinite(n) ? n : 0);
  }

  amountTooLow = computed(() => this.amount() < this.nextMin());

  submit(): void {
    if (!this.canBid() || this.sending()) return;
    if (this.amountTooLow()) {
      this.message.set({ kind: 'error', text: `La oferta mínima ahora es ${this.formatQ(this.nextMin())}.` });
      return;
    }
    this.sending.set(true);
    this.message.set(null);
    const offered = this.amount();
    this.vehicles.placeBid(this.auctionId(), offered).subscribe({
      next: () => {
        this.sending.set(false);
        this.message.set({ kind: 'ok', text: `Oferta de ${this.formatQ(offered)} registrada.` });
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        const body = err.error as ApiError | null;
        if (body?.nextMinBid) this.amount.set(body.nextMinBid);
        if (err.status === 401) {
          this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
          return;
        }
        this.message.set({ kind: 'error', text: body?.message ?? 'No se pudo enviar la oferta. Intenta de nuevo.' });
      },
    });
  }

  private formatQ(n: number): string {
    return `Q ${new Intl.NumberFormat('es-GT').format(n)}`;
  }
}
