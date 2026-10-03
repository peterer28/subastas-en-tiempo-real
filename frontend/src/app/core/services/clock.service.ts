import { Injectable, computed, inject, signal } from '@angular/core';
import { LiveAuctionService } from './live-auction.service';

/** Reloj compartido sincronizado con el servidor de Firebase. */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private live = inject(LiveAuctionService);
  private local = signal(Date.now());
  readonly now = computed(() => this.local() + this.live.serverOffset());

  constructor() {
    setInterval(() => this.local.set(Date.now()), 250);
  }
}
